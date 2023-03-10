import {Client, DIRECTION, Lugo, Mapper, rl} from "@lugobots/lugo4node";
import {MyBotTrainer, TRAINING_PLAYER_NUMBER} from "./my_bot";
import {QLearner} from "./q-learning";

const modelFilepath = './sample-model.json'

// training settings
const trainIterations = 100000;
const stepsPerIteration = 1000;
const environmentRefreshInterval = 10;// every N iterations the environment will be randomly change

const testSessionInterval = 1000;
const gamesPerTestSession = 10;
const stepsPerGame = 80;

const grpcAddress = "localhost:5000";
const grpcInsecure = true;

(async () => {

    const teamSide = Lugo.Team.Side.HOME

    // the map will help us to see the field in quadrants (called regions) instead of working with coordinates
    // the Mapper will translate the coordinates based on the side the bot is playing on
    const map = new Mapper(20, 10, Lugo.Team.Side.HOME)

    // our bot strategy defines our bot initial position based on its number
    const initialRegion = map.getRegion(5, 4)

    // now we can create the bot. We will use a shortcut to create the client from the config, but we could use the
    // client constructor as well
    const lugoClient = new Client(
        grpcAddress,
        grpcInsecure,
        "",
        teamSide,
        TRAINING_PLAYER_NUMBER,
        initialRegion.getCenter())

    // The RemoteControl is a gRPC client that will connect to the Game Server and change the element positions
    const rc = new rl.RemoteControl();
    await rc.connect(grpcAddress)

    const bot = new MyBotTrainer(rc)

    // now we can create the Gym, that will control all async work and allow us to focus on the learning part
    const gym = new rl.Gym(rc, bot, myTrainingFunction, {debugging_log: false})

    // starting the game:
    // If you want to train playing against another bot, you should start the other team first.
    // If you want to train using two teams, you should start the away team, then start the training bot, and finally start the home team
    // await gym.start(lugoClient)

    // if you want to train controlling all players, use the withZombiePlayers players to create zombie players.
    await gym.withZombiePlayers(grpcAddress).start(lugoClient)
})();


async function myTrainingFunction(trainingCtrl: rl.TrainingController): Promise<void> {
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


    let learner = new QLearner(0.4, 0.8)
    learner.load(modelFilepath);
    const exploration = 0.05

    const scores = [];
    for (let i = 0; i < trainIterations; ++i) {
        try {
            scores[i] = 0
            await trainingCtrl.setEnvironment({randomize: i % environmentRefreshInterval == 0});

            let sensorsState0 = await trainingCtrl.getState()
            for (let j = 0; j < stepsPerIteration; ++j) {
                const currentState = nameState(sensorsState0)

                //and the best action
                let action = learner.bestAction(currentState);
                //if there is no best action try to explore
                if ((action == undefined) || (learner.getQValue(currentState, action) <= 0) || (Math.random() < exploration)) {
                    action = possibleAction[Math.floor(Math.random() * possibleAction.length)];
                }

                // then we pass the action to our update method
                const {reward, done} = await trainingCtrl.update(action);


                let sensorsState1 = await trainingCtrl.getState();

                const nextState = nameState(sensorsState1)
                learner.add(currentState, nextState, reward, action);

                //make que q-learning algorithm number of iterations=10 or it could be another number
                learner.learn(10);

                sensorsState0 = sensorsState1

                // now we should reward our model with the reward value
                scores[i] += reward
                if (done) {
                    // no more steps
                    break;
                }
            }
            console.log(`End of train iteration ${i}, score: `, scores[i])

            learner.save(modelFilepath)

            if ((i + 1) % testSessionInterval === 0) {
                console.log(`Starting test session for interaction ${i}`)
                for (let trainI = 0; trainI < gamesPerTestSession; ++trainI) {
                    let gameScore = 0;
                    await trainingCtrl.setEnvironment({randomize: true});
                    for (let gameI = 0; gameI < stepsPerGame; ++gameI) {
                        const sensorsStateTest = await trainingCtrl.getState();
                        const currentState = nameState(sensorsStateTest)

                        //and the best action
                        let action = learner.predictAction(currentState);
                        //if there is no best action try to explore
                        if (!action) {
                            console.error(`NO action found for state ${currentState}`)
                            action = possibleAction[Math.floor(Math.random() * possibleAction.length)];
                        }
                        const {reward, done} = await trainingCtrl.update(action);
                        gameScore += reward
                        if (done) {
                            console.log(`Game done after ${gameI} steps`)
                            break;
                        }
                    }
                    console.log(`End of train game ${trainI}, final score: `, gameScore)
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
    await trainingCtrl.stop()
    console.log(`Training is over, scores: `, scores)
}

function nameState(sensors) {
    return JSON.stringify(sensors)
}

