import {DIRECTION, GameSnapshotReader, geo, Lugo, Mapper, ORIENTATION, Region, rl, SPECS} from "@lugobots/lugo4node";

export const TRAINING_PLAYER_NUMBER = 5

enum SENSOR_AREA {
    FRONT,
    FRONT_LEFT,
    FRONT_RIGHT,
    BACK,
    BACK_LEFT,
    BACK_RIGHT,
};

export class MyBotTrainer implements rl.BotTrainer {

    private remoteControl: rl.RemoteControl;

    private mapper: Mapper;

    private initPosition;

    constructor(remoteControl: rl.RemoteControl) {
        this.remoteControl = remoteControl
        this.mapper = new Mapper(30, 15, Lugo.Team.Side.HOME)
    }

    async createNewInitialState(params: any): Promise<Lugo.GameSnapshot> {

        if (params.randomize) {
            for (let i = 1; i <= 11; i++) {
                await this._randomPlayerPos(this.mapper, Lugo.Team.Side.HOME, i)
                await this._randomPlayerPos(this.mapper, Lugo.Team.Side.AWAY, i)
            }

            this.initPosition = this.mapper.getRegion(15, randomInteger(4, 10)).getCenter()
        }


        const randomVelocity = new Lugo.Velocity()
        randomVelocity.setSpeed(0)
        randomVelocity.setDirection(ORIENTATION.NORTH)// irrelevant
        await this.remoteControl.setPlayerProps(
            Lugo.Team.Side.HOME,
            TRAINING_PLAYER_NUMBER,
            this.initPosition,
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

    getState(snapshot: Lugo.GameSnapshot): any {
        const reader = new GameSnapshotReader(snapshot, Lugo.Team.Side.HOME)
        const me = this.getMe(reader)

        // I am using another mapper used to define the two first inputs
        // since these inputs do not have to be too granular, I am using a more wide grid so we will have less
        // values. It will improve te training performance considerably
        const sensorMapper = new Mapper(10, 5, Lugo.Team.Side.HOME);
        const myGridPos = sensorMapper.getRegionFromPoint(me.getPosition())
        const opponentGoalGridPos = sensorMapper.getRegionFromPoint(reader.getOpponentGoal().getCenter())

        return [
            opponentGoalGridPos.getCol() - myGridPos.getCol(),// steps away from the goal in X axis
            opponentGoalGridPos.getRow() - myGridPos.getRow(),// steps away from the goal in Y axis
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.FRONT),
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.FRONT_LEFT),
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.FRONT_RIGHT),
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.BACK),
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.BACK_LEFT),
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.BACK_RIGHT),
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
        if (me.getPosition().getX() > (SPECS.FIELD_WIDTH - SPECS.GOAL_ZONE_RANGE) * 0.90) {
            done = true;
            reward = 10000;
        }
        //negative end
        const stepsToClosestObstacle = Math.min(
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.FRONT) ?? Infinity,
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.FRONT_LEFT) ?? Infinity,
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.FRONT_RIGHT) ?? Infinity,
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.BACK) ?? Infinity,
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.BACK_LEFT) ?? Infinity,
            this._stepsToObstacleWithinArea(reader, SENSOR_AREA.BACK_RIGHT) ?? Infinity,
        );
        if (stepsToClosestObstacle < 8) {
            done = true;
            reward = -20000;
        }

        return {done, reward}
    }

    async _randomPlayerPos(mapper, side, number) {
        const minCol = 15
        const maxCol = 27
        const minRow = 3
        const maxRow = 11

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
     * Returns the number of steps between the bot and the closest obstacle within that region
     *
     * TODO the observation MUST translate the coordinates based on the bot side
     * @param {GameSnapshotReader} reader
     * @param sensorArea
     * @private
     */
    _stepsToObstacleWithinArea(reader, sensorArea: SENSOR_AREA) {
        // SPECS.PLAYER_MAX_SPEED is a step
        const frontwardView = SPECS.PLAYER_MAX_SPEED * 15;//
        const sidesView = SPECS.PLAYER_MAX_SPEED * 15;//
        const backwardView = SPECS.PLAYER_MAX_SPEED * 15;//

        const myPos = this.getMe(reader).getPosition();

        const botPoint = [myPos.getX(), myPos.getY()]

        // Each region is a triangle where the start point is the bot position and the other two vertex
        // are defined by the sensor direction:

        // front
        let pointA = [myPos.getX() + frontwardView, myPos.getY() + sidesView]
        let pointB = [myPos.getX() + frontwardView, myPos.getY() - sidesView]
        switch (sensorArea) {
            case SENSOR_AREA.FRONT_LEFT:
                pointA = [myPos.getX(), myPos.getY() + sidesView]
                pointB = [myPos.getX() + frontwardView, myPos.getY() + sidesView]
                break;
            case SENSOR_AREA.FRONT_RIGHT:
                pointA = [myPos.getX(), myPos.getY() - sidesView]
                pointB = [myPos.getX() + frontwardView, myPos.getY() - sidesView]
                break;
            case SENSOR_AREA.BACK:
                pointA = [myPos.getX() - backwardView, myPos.getY() + sidesView]
                pointB = [myPos.getX() - backwardView, myPos.getY() - sidesView]
                break;
            case SENSOR_AREA.BACK_LEFT:
                pointA = [myPos.getX(), myPos.getY() + sidesView]
                pointB = [myPos.getX() - backwardView, myPos.getY() + sidesView]
                break;
            case SENSOR_AREA.BACK_RIGHT:
                pointA = [myPos.getX(), myPos.getY() - sidesView]
                pointB = [myPos.getX() - backwardView, myPos.getY() - sidesView]
                break;
        }

        const getOpponents = reader.getTeam(reader.getOpponentSide()).getPlayersList()
        let nearestOpponentDist = null
        for (const opponent of getOpponents) {
            const opponentPoint = [opponent.getPosition().getX(), opponent.getPosition().getY()];
            if (this._isPointInPolygon(opponentPoint, [botPoint, pointA, pointB])) {
                const distToBot = Math.abs(geo.distanceBetweenPoints(opponent.getPosition(), myPos));
                if (nearestOpponentDist == null || nearestOpponentDist > distToBot) {
                    nearestOpponentDist = distToBot
                }
            }
        }
        if (nearestOpponentDist != null) {
            return Math.floor(nearestOpponentDist / SPECS.PLAYER_MAX_SPEED)
        }
        return null
    }

    // thank you chatGPT S2
    _isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            let xi = polygon[i][0], yi = polygon[i][1];
            let xj = polygon[j][0], yj = polygon[j][1];

            let intersect = ((yi > point[1]) !== (yj > point[1]))
                && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

}

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
