import {GameSnapshotReader, Lugo, Mapper, SPECS, ORIENTATION, rl, DIRECTION, geo, Region} from "@lugobots/lugo4node";

export const TRAINING_PLAYER_NUMBER = 5

enum SENSOR_AREA {
    FRONT,
    FRONT_LEFT,
    FRONT_RIGHT,
    LEFT,
    RIGHT,
    BACK,
};

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
        const me = this.getMe(reader)

        // I am using another mapper used to define the two first inputs
        // since these inputs do not have to be too granular, I am using a more wide grid so we will have less
        // values. It will improve te training performance considerably
        const sensorMapper = new Mapper(4, 3, Lugo.Team.Side.HOME);
        const myGridPos = sensorMapper.getRegionFromPoint(me.getPosition())
        const opponentGoalGridPos = sensorMapper.getRegionFromPoint(reader.getOpponentGoal().getCenter())

        return [
            opponentGoalGridPos.getCol() - myGridPos.getCol(),// steps away from the goal in X axis
            opponentGoalGridPos.getRow() - myGridPos.getRow(),// steps away from the goal in Y axis
            this._colisionOnDirection(reader, SENSOR_AREA.FRONT),
            this._colisionOnDirection(reader, SENSOR_AREA.LEFT),
            this._colisionOnDirection(reader, SENSOR_AREA.RIGHT),
            this._colisionOnDirection(reader, SENSOR_AREA.FRONT_LEFT),
            this._colisionOnDirection(reader, SENSOR_AREA.FRONT_RIGHT),
        ];
    }

    async play(orderSet: Lugo.OrderSet, snapshot: Lugo.GameSnapshot, action: any): Promise<Lugo.OrderSet> {
        const reader = new GameSnapshotReader(snapshot, Lugo.Team.Side.HOME)
        const possibleAction = [
            DIRECTION.FORWARD,
            DIRECTION.BACKWARD,
            DIRECTION.LEFT,
            DIRECTION.RIGHT,
            DIRECTION.FORWARD_RIGHT,
            DIRECTION.FORWARD_LEFT,
            // DIRECTION.BACKWARD_RIGHT,
            // DIRECTION.BACKWARD_LEFT,
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
        const me = this.getMe(reader);
        const mePreviously = this.getMe(readerPrevious);

        // const mappedOpponents = this._findOpponent(reader)
        const opponentGoal = reader.getOpponentGoal().getCenter()

        const previousDist = Math.hypot(opponentGoal.getX() - mePreviously.getPosition().getX(),
            opponentGoal.getY() - mePreviously.getPosition().getY())

        const actualDist = Math.hypot(opponentGoal.getX() - me.getPosition().getX(),
            opponentGoal.getY() - me.getPosition().getY())

        let reward = (previousDist - actualDist);
        let done = false;

        // positive end
        if (me.getPosition().getX() > (SPECS.FIELD_WIDTH - SPECS.GOAL_ZONE_RANGE) * 0.98) {
            done = true;
        }
        //negative end
        const botPoint = [me.getPosition().getX(), me.getPosition().getY()]
        if (this._pointCollidesWithOpponent(reader, botPoint)) {
            done = true;
            reward = -20000;
        }

        return {done, reward}
    }

    async _randomPlayerPos(mapper, side, number) {
        const minCol = 16
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

    getMe(reader: GameSnapshotReader) {
        const me = reader.getPlayer(Lugo.Team.Side.HOME, TRAINING_PLAYER_NUMBER)
        if (!me) {
            throw new Error("did not find myself in the game")
        }
        return me;
    }

    /**
     * 
     * @param {GameSnapshotReader} reader
     * @param sensorArea
     * @returns bool Indicator if there is a collision taking a step on the given direction 
     */
    _colisionOnDirection(reader, sensorArea: SENSOR_AREA) {
        // SPECS.PLAYER_MAX_SPEED is a step
        const playerMaxDislocation = SPECS.PLAYER_MAX_SPEED;//

        const myPos = this.getMe(reader).getPosition();

        let forecastPosition = [myPos.getX() + playerMaxDislocation, myPos.getY()]
        switch (sensorArea) {
            case SENSOR_AREA.LEFT:
                forecastPosition = [myPos.getX(), myPos.getY() + playerMaxDislocation]
                break;
            case SENSOR_AREA.RIGHT:
                forecastPosition = [myPos.getX(), myPos.getY() - playerMaxDislocation]
                break;
            case SENSOR_AREA.BACK:
                forecastPosition = [myPos.getX() - playerMaxDislocation, myPos.getY()]
                break;
            case SENSOR_AREA.FRONT_LEFT:
                forecastPosition = [myPos.getX() + playerMaxDislocation/2, myPos.getY() + playerMaxDislocation/2]
                break;
            case SENSOR_AREA.FRONT_RIGHT:
                forecastPosition = [myPos.getX() + playerMaxDislocation/2, myPos.getY() - playerMaxDislocation/2]
                break;
        }

        return this._pointCollidesWithOpponent(reader, forecastPosition);
    }

    _pointCollidesWithOpponent(reader, point){
        const getOpponents = reader.getTeam(reader.getOpponentSide()).getPlayersList()
        for (const opponent of getOpponents) {
            const distToBot = Math.hypot(opponent.getPosition().getX() - point[0], opponent.getPosition().getY() - point[1]);
            if (distToBot <= SPECS.PLAYER_SIZE) {
                return 1
            }
        }
        return 0
    }

    /**
     *
     * @param mappedOpponents
     * @param {Region} region
     * @returns {boolean}
     * @private
     */
    _hasOpponent(mappedOpponents, region) {
        if (mappedOpponents[region.getCol()] !== undefined) {
            return mappedOpponents[region.getCol()][region.getRow()];
        }
        return false;
    }
}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
