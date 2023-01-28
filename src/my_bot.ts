import {GameSnapshotReader, Lugo, Mapper, SPECS, ORIENTATION, rl, DIRECTION} from "@lugobots/lugo4node";

export const TRAINING_PLAYER_NUMBER = 5

export class MyBotTrainer implements rl.BotTrainer {

    private remoteControl: rl.RemoteControl;

    private mapper: Mapper;

    constructor(remoteControl: rl.RemoteControl) {
        this.remoteControl = remoteControl
    }

    async createNewInitialState(): Promise<Lugo.GameSnapshot> {
        this.mapper = new Mapper(30, 15, Lugo.Team.Side.HOME)
        for (let i = 1; i <= 11; i++) {
            await this._randomPlayerPos(this.mapper, Lugo.Team.Side.HOME, i)
            await this._randomPlayerPos(this.mapper, Lugo.Team.Side.AWAY, i)
        }

        const randomVelocity = new Lugo.Velocity()
        randomVelocity.setSpeed(0)
        randomVelocity.setDirection(ORIENTATION.NORTH)// irrelevant
        await this.remoteControl.setPlayerProps(
            Lugo.Team.Side.HOME,
            TRAINING_PLAYER_NUMBER,
            this.mapper.getRegion(15, randomInteger(4, 10)).getCenter(),
            randomVelocity)

        const ballPos = new Lugo.Point()
        ballPos.setX(0)
        ballPos.setY(0)
        const newVelocity = new Lugo.Velocity()
        newVelocity.setSpeed(0)
        newVelocity.setDirection(ORIENTATION.NORTH)// irrelevant

        await this.remoteControl.setTurn(1)
        return await this.remoteControl.setBallProps(ballPos, newVelocity)
    }

    getInputs(snapshot: Lugo.GameSnapshot): any {
        const reader = new GameSnapshotReader(snapshot, Lugo.Team.Side.HOME)
        const me = reader.getPlayer(Lugo.Team.Side.HOME, 5)
        if (!me) {
            throw new Error("did not find myself in the game")
        }
        const mappedOpponents = this._findOpponent(reader)
        const myPosition = this.mapper.getRegionFromPoint(me.getPosition())

        let sensorFront = 0
        if (
            this._hasOpponent(mappedOpponents, myPosition.front()) ||
            this._hasOpponent(mappedOpponents, myPosition.front().left()) ||
            this._hasOpponent(mappedOpponents, myPosition.front().right())
        ) {
            sensorFront = 3
        } else if (
            this._hasOpponent(mappedOpponents, myPosition.front().front()) ||
            this._hasOpponent(mappedOpponents, myPosition.front().front().left()) ||
            this._hasOpponent(mappedOpponents, myPosition.front().front().right()) ||
            this._hasOpponent(mappedOpponents, myPosition.front().left().left()) ||
            this._hasOpponent(mappedOpponents, myPosition.front().right().right())
        ) {
            sensorFront = 2
        } else if (
            this._hasOpponent(mappedOpponents, myPosition.front().front().front()) ||
            this._hasOpponent(mappedOpponents, myPosition.front().front().front().left()) ||
            this._hasOpponent(mappedOpponents, myPosition.front().front().front().right())
        ) {
            sensorFront = 1
        }

        let sensorLeft = 0
        if (this._hasOpponent(mappedOpponents, myPosition.left())) {
            sensorLeft = 3
        } else if (this._hasOpponent(mappedOpponents, myPosition.left().left())) {
            sensorLeft = 2
        } else if (this._hasOpponent(mappedOpponents, myPosition.left().left())) {
            sensorLeft = 1
        }

        let sensorRight = 0
        if (this._hasOpponent(mappedOpponents, myPosition.right())) {
            sensorRight = 3
        } else if (this._hasOpponent(mappedOpponents, myPosition.right().right())) {
            sensorRight = 2
        } else if (this._hasOpponent(mappedOpponents, myPosition.right().right().right())) {
            sensorRight = 1
        }

        // console.log(`Sensorres: `, [sensorFront, sensorLeft, sensorRight])
        return [sensorFront, sensorLeft, sensorRight];
    }

    async play(orderSet: Lugo.OrderSet, snapshot: Lugo.GameSnapshot, action: any): Promise<Lugo.OrderSet> {
        const reader = new GameSnapshotReader(snapshot, Lugo.Team.Side.HOME)
        const me = reader.getPlayer(Lugo.Team.Side.HOME, 5)
        if (!me) {
            throw new Error("did not find myself in the game")
        }
        const possibleAction = [
            DIRECTION.FORWARD,
            DIRECTION.BACKWARD,
            DIRECTION.LEFT,
            DIRECTION.RIGHT,
        ];

        const dir = reader.makeOrderMoveByDirection(possibleAction[action])
        return orderSet.setOrdersList([dir])
    }

    async evaluate(previousSnapshot: Lugo.GameSnapshot, newSnapshot: Lugo.GameSnapshot): Promise<{
        reward: number;
        done: boolean;
    }> {
        const readerPrevious = new GameSnapshotReader(previousSnapshot, Lugo.Team.Side.HOME)
        const reader = new GameSnapshotReader(newSnapshot, Lugo.Team.Side.HOME)
        const me = reader.getPlayer(Lugo.Team.Side.HOME, 5)
        if (!me) {
            throw new Error("did not find myself in the game")
        }
        const mePreviously = readerPrevious.getPlayer(Lugo.Team.Side.HOME, 5)
        if (!mePreviously) {
            throw new Error("did not find myself in the game")
        }

        const mappedOpponents = this._findOpponent(reader)
        const opponentGoal = reader.getOpponentGoal().getCenter()

        const previousDist = Math.hypot(opponentGoal.getX() - mePreviously.getPosition().getX(),
            opponentGoal.getY() - mePreviously.getPosition().getY())

        const actualDist = Math.hypot(opponentGoal.getX() - me.getPosition().getX(),
            opponentGoal.getY() - me.getPosition().getY())

        const myPosition = this.mapper.getRegionFromPoint(me.getPosition())
        let reward = (previousDist > actualDist) ? 3 : 1;
        let done = false

        const previousPenalty = this.getInputs(previousSnapshot).reduce((a, b) => a + b)
        const newPenalty = this.getInputs(newSnapshot).reduce((a, b) => a + b)

       reward -= newPenalty
        if (previousPenalty > newPenalty) {
            reward++;

        }

        if (mePreviously.getPosition().getX() > (SPECS.FIELD_WIDTH - SPECS.GOAL_ZONE_RANGE) * 0.9) {
            done = true
        }

        return {done, reward}
    }

    async _randomPlayerPos(mapper, side, number) {
        const minCol = 15
        const maxCol = 27
        const minRow = 2
        const maxRow = 12

        const randomVelocity = new Lugo.Velocity()
        randomVelocity.setSpeed(0)
        randomVelocity.setDirection(ORIENTATION.NORTH)// irrelevant

        const randomCol = randomInteger(minCol, maxCol)
        const randomRow = randomInteger(minRow, maxRow)
        const randomPosition = mapper.getRegion(randomCol, randomRow).getCenter()
        await this.remoteControl.setPlayerProps(side, number, randomPosition, randomVelocity)
    }

    /**
     *
     * @param {GameSnapshotReader} reader
     * @private
     */
    _findOpponent(reader) {
        const getOpponents = reader.getTeam(reader.getOpponentSide()).getPlayersList()
        const mappedOpponents = []
        for (const opponent of getOpponents) {
            const opponentRegion = this.mapper.getRegionFromPoint(opponent.getPosition())
            if (mappedOpponents[opponentRegion.getCol()] === undefined) {
                mappedOpponents[opponentRegion.getCol()] = []
            }
            mappedOpponents[opponentRegion.getCol()][opponentRegion.getRow()] = true
        }
        return mappedOpponents
    }

    /**
     *
     * @param mappedOpponents
     * @param {Region} region
     * @returns {boolean}
     * @private
     */
    _hasOpponent(mappedOpponents, region) {
        return mappedOpponents[region.getCol()] !== undefined && mappedOpponents[region.getCol()][region.getRow()] === true
    }
}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
