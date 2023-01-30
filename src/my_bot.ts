import {GameSnapshotReader, Lugo, Mapper, SPECS, ORIENTATION, rl, DIRECTION, Region} from "@lugobots/lugo4node";

export const TRAINING_PLAYER_NUMBER = 5

export class MyBotTrainer implements rl.BotTrainer {

    private remoteControl: rl.RemoteControl;

    private mapper: Mapper;

    constructor(remoteControl: rl.RemoteControl) {
        this.remoteControl = remoteControl
    }

    async createNewInitialState(): Promise<Lugo.GameSnapshot> {
        this.mapper = new Mapper(60, 30, Lugo.Team.Side.HOME)
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
            this.mapper.getRegion(30, randomInteger(8, 15)).getCenter(),
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
        const goalPosition = reader.getOpponentGoal().getCenter();

        const stateMapper = new Mapper(5, 3, Lugo.Team.Side.HOME);
        const mySimplePosition = stateMapper.getRegionFromPoint(me.getPosition())
        // console.log(`Sensorres: `, [sensorFront, sensorLeft, sensorRight])
        return [
            mySimplePosition.getCol(),// equivalent to X
            mySimplePosition.getRow(),// Equivalent to Y
            this.getFrontSensor(mappedOpponents, myPosition),
            this.getBackSensor(mappedOpponents, myPosition),
            this.getLeftFrontSensor(mappedOpponents, myPosition),
            this.getRightFrontSensor(mappedOpponents, myPosition),
            this.getLeftBackSensor(mappedOpponents, myPosition),
            this.getRightBackSensor(mappedOpponents, myPosition),
        ];
    }

    getFrontSensor(mappedOpponents, myPosition: Region) {
        let front = myPosition.front()
        if (
            this._hasOpponent(mappedOpponents, front) ||
            this._hasOpponent(mappedOpponents, front.left()) ||
            this._hasOpponent(mappedOpponents, front.right())
        ) {
            return 4
        }

        front = front.front()
        if (
            this._hasOpponent(mappedOpponents, front) ||
            this._hasOpponent(mappedOpponents, front.left()) ||
            this._hasOpponent(mappedOpponents, front.left().left()) ||
            this._hasOpponent(mappedOpponents, front.right()) ||
            this._hasOpponent(mappedOpponents, front.right().right())
        ) {
            return 3
        }

        return 0
        front = front.front()
        if (
            this._hasOpponent(mappedOpponents, front) ||
            this._hasOpponent(mappedOpponents, front.left()) ||
            this._hasOpponent(mappedOpponents, front.left().left()) ||
            this._hasOpponent(mappedOpponents, front.left().left().left()) ||
            this._hasOpponent(mappedOpponents, front.right()) ||
            this._hasOpponent(mappedOpponents, front.right().right()) ||
            this._hasOpponent(mappedOpponents, front.right().right().right())
        ) {
            return 2
        }
        front = front.front()
        if (
            this._hasOpponent(mappedOpponents, front) ||
            this._hasOpponent(mappedOpponents, front.left()) ||
            this._hasOpponent(mappedOpponents, front.left().left()) ||
            this._hasOpponent(mappedOpponents, front.left().left().left()) ||
            this._hasOpponent(mappedOpponents, front.left().left().left().left()) ||
            this._hasOpponent(mappedOpponents, front.right()) ||
            this._hasOpponent(mappedOpponents, front.right().right()) ||
            this._hasOpponent(mappedOpponents, front.right().right().right()) ||
            this._hasOpponent(mappedOpponents, front.right().right().right().right())
        ) {
            return 1
        }

        return 0
    }

    getBackSensor(mappedOpponents, myPosition: Region) {
        let back = myPosition.back()
        if (
            this._hasOpponent(mappedOpponents, back)
        ) {
            return 4
        }
        back = back.back()
        if (
            this._hasOpponent(mappedOpponents, back) ||
            this._hasOpponent(mappedOpponents, back.left()) ||
            this._hasOpponent(mappedOpponents, back.right())
        ) {
            return 3
        }
        return 0
        
        back = back.back()
        if (
            this._hasOpponent(mappedOpponents, back) ||
            this._hasOpponent(mappedOpponents, back.left()) ||
            this._hasOpponent(mappedOpponents, back.left().left()) ||
            this._hasOpponent(mappedOpponents, back.right()) ||
            this._hasOpponent(mappedOpponents, back.right().right())
        ) {
            return 2
        }
        return 0
    }

    getLeftFrontSensor(mappedOpponents, myPosition: Region) {
        let left = myPosition.left()
        if (
            this._hasOpponent(mappedOpponents, left)
        ) {
            return 4
        }
        left = left.left()
        if (
            this._hasOpponent(mappedOpponents, left) ||
            this._hasOpponent(mappedOpponents, left.front())
        ) {
            return 3
        }

        return 0
        
        left = left.left()
        if (
            this._hasOpponent(mappedOpponents, left) ||
            this._hasOpponent(mappedOpponents, left.front()) ||
            this._hasOpponent(mappedOpponents, left.front().front())
        ) {
            return 2
        }

        left = left.left()
        if (
            this._hasOpponent(mappedOpponents, left) ||
            this._hasOpponent(mappedOpponents, left.front()) ||
            this._hasOpponent(mappedOpponents, left.front().front()) ||
            this._hasOpponent(mappedOpponents, left.front().front().front())
        ) {
            return 1
        }

        return 0
    }

    getRightFrontSensor(mappedOpponents, myPosition: Region) {
        let right = myPosition.right()
        if (
            this._hasOpponent(mappedOpponents, right)
        ) {
            return 4
        }
        right = right.right()
        if (
            this._hasOpponent(mappedOpponents, right) ||
            this._hasOpponent(mappedOpponents, right.front())
        ) {
            return 3
        }

        return 0
        
        right = right.right()
        if (
            this._hasOpponent(mappedOpponents, right) ||
            this._hasOpponent(mappedOpponents, right.front()) ||
            this._hasOpponent(mappedOpponents, right.front().front())
        ) {
            return 2
        }

        right = right.right()
        if (
            this._hasOpponent(mappedOpponents, right) ||
            this._hasOpponent(mappedOpponents, right.front()) ||
            this._hasOpponent(mappedOpponents, right.front().front()) ||
            this._hasOpponent(mappedOpponents, right.front().front().front())
        ) {
            return 1
        }

        return 0
    }

    getLeftBackSensor(mappedOpponents, myPosition: Region) {
        let left = myPosition.left().back()
        if (
            this._hasOpponent(mappedOpponents, left)
        ) {
            return 4
        }
        left = left.left()
        if (
            this._hasOpponent(mappedOpponents, left) ||
            this._hasOpponent(mappedOpponents, left.back())
        ) {
            return 3
        }

        return 0
        left = left.left()
        if (
            this._hasOpponent(mappedOpponents, left) ||
            this._hasOpponent(mappedOpponents, left.back()) ||
            this._hasOpponent(mappedOpponents, left.back().back())
        ) {
            return 2
        }

        left = left.left()
        if (
            this._hasOpponent(mappedOpponents, left) ||
            this._hasOpponent(mappedOpponents, left.back()) ||
            this._hasOpponent(mappedOpponents, left.back().back())
        ) {
            return 1
        }

        return 0
    }

    getRightBackSensor(mappedOpponents, myPosition: Region) {
        let right = myPosition.right().back()
        if (
            this._hasOpponent(mappedOpponents, right)
        ) {
            return 4
        }
        right = right.right()
        if (
            this._hasOpponent(mappedOpponents, right) ||
            this._hasOpponent(mappedOpponents, right.back())
        ) {
            return 3
        }

        return 0
        right = right.right()
        if (
            this._hasOpponent(mappedOpponents, right) ||
            this._hasOpponent(mappedOpponents, right.back()) ||
            this._hasOpponent(mappedOpponents, right.back().back())
        ) {
            return 2
        }

        right = right.right()
        if (
            this._hasOpponent(mappedOpponents, right) ||
            this._hasOpponent(mappedOpponents, right.back()) ||
            this._hasOpponent(mappedOpponents, right.back().back())
        ) {
            return 1
        }

        return 0
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
            DIRECTION.FORWARD_RIGHT,
            DIRECTION.FORWARD_LEFT,
            DIRECTION.BACKWARD_RIGHT,
            DIRECTION.BACKWARD_LEFT,
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

        // const mappedOpponents = this._findOpponent(reader)
        const opponentGoal = reader.getOpponentGoal().getCenter()

        const previousDist = Math.hypot(opponentGoal.getX() - mePreviously.getPosition().getX(),
            opponentGoal.getY() - mePreviously.getPosition().getY())

        const actualDist = Math.hypot(opponentGoal.getX() - me.getPosition().getX(),
            opponentGoal.getY() - me.getPosition().getY())

        const myPosition = this.mapper.getRegionFromPoint(me.getPosition())
        let reward = (previousDist - actualDist);
        let done = false;

        // positive end
        // if (me.getPosition().getX() > (SPECS.FIELD_WIDTH - SPECS.GOAL_ZONE_RANGE)*0.90 && (me.getPosition().getY() >= SPECS.GOAL_MIN_Y) && (me.getPosition().getY() <= SPECS.GOAL_MAX_Y) ) {
        if (me.getPosition().getX() > (SPECS.FIELD_WIDTH - SPECS.GOAL_ZONE_RANGE)*0.93){
            done = true;
            reward = 10000;
        }
        //negative end
        const mappedOpponents = this._findOpponent(reader);
        if(this._hasOpponent(mappedOpponents, myPosition)){
            done = true;
            reward = -20000;
        }

        // console.log(`newPenalty: ${newPenalty},     previousPenalty: ${previousPenalty},    deltaSensors: ${deltaSensors},  reward: ${reward}`)
        return {done, reward}
    }

    async _randomPlayerPos(mapper, side, number) {
        const minCol = 30
        const maxCol = 54
        const minRow = 4
        const maxRow = 24

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
            mappedOpponents[opponentRegion.getCol()][opponentRegion.getRow()] = opponent.getPosition()
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
        if(mappedOpponents[region.getCol()] !== undefined) {
            return mappedOpponents[region.getCol()][region.getRow()];
        }
        return false;
    }
}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
