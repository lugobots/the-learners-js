import * as tf from '@tensorflow/tfjs-node';
import {Mapper, Client, rl, Lugo, DIRECTION} from "@lugobots/lugo4node";

import {MyBotTrainer, TRAINING_PLAYER_NUMBER} from "./my_bot";

// training settings
const trainIterations = 50;
const stepsPerIteration = 50;

const grpcAddress = "localhost:5000";
const grpcInsecure = true;

(async () => {

    const teamSide = Lugo.Team.Side.HOME

    // the map will help us to see the field in quadrants (called regions) instead of working with coordinates
    const map = new Mapper(10, 6, Lugo.Team.Side.HOME)

    // our bot strategy defines our bot initial position based on its number
    const initialRegion = map.getRegion(1, 1)

    // now we can create the bot. We will use a shortcut to create the client from the config, but we could use the
    // client constructor as well
    const lugoClient = new Client(
        grpcAddress,
        grpcInsecure,
        "",
        teamSide,
        TRAINING_PLAYER_NUMBER,
        initialRegion.getCenter())

    const rc = new rl.RemoteControl();
    await rc.connect(grpcAddress)

    const bot = new MyBotTrainer(rc)
    const gym = new rl.Gym(rc, bot, myTrainingFunction, {debugging_log: false})

    await gym.withZombiePlayers(grpcAddress).start(lugoClient)
})();


async function myTrainingFunction(trainingCtrl: rl.TrainingController): Promise<void> {
    console.log(`Let's training`)

    const possibleAction = [
        DIRECTION.FORWARD,
        DIRECTION.BACKWARD,
        DIRECTION.LEFT,
        DIRECTION.RIGHT,
        DIRECTION.BACKWARD_LEFT,
        DIRECTION.BACKWARD_RIGHT,
        DIRECTION.FORWARD_RIGHT,
        DIRECTION.FORWARD_LEFT,
    ];
    const scores = [];
    for (let i = 0; i < trainIterations; ++i) {
        try {
            scores[i] = 0
            await trainingCtrl.setRandomState();

            for (let j = 0; j < stepsPerIteration; ++j) {
                const sensors = await trainingCtrl.getInputs();
                // the sensors would feed or training model, which would return the next action
                const action = possibleAction[Math.floor(Math.random() * possibleAction.length)];

                // then we pass the action to our update method
                const {reward, done} = await trainingCtrl.update(action);
                // now we should reward our model with the reward value
                scores[i] += reward
                if (done) {
                    // no more steps
                    console.log(`End of trainIteration ${i}, score: `, scores[i])
                    break;
                }
            }

        } catch (e) {
            console.error(e);
        }
    }
    await trainingCtrl.stop()
    console.log(`Training is over, scores: `, scores)
}

