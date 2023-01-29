import {Mapper, Client, rl, Lugo, DIRECTION, SPECS } from "@lugobots/lugo4node";

import {MyBotTrainer, TRAINING_PLAYER_NUMBER} from "./my_bot";
import {PolicyNetwork}  from "./model";

import * as tf from "@tensorflow/tfjs-node";

// training settings
const trainIterations = 50;
const stepsPerIteration = 10;

const grpcAddress = "localhost:5000";
const grpcInsecure = true;

const exportModelAtEnd = true;

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
    console.log(`Let's start training`)

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


    let policyNet = new PolicyNetwork([1] , possibleAction.length, 0.1);

    for (let i = 0; i < trainIterations; ++i) {
        try {
            scores[i] = 0
            await trainingCtrl.setRandomState();

            const allGradients = [];
            const allRewards = [];
            const gameSteps = [];
            const gameRewards = [];
            const gameGradients = [];

            for (let j = 0; j < stepsPerIteration; ++j) {
                const sensors = await trainingCtrl.getInputs();
                const inputTensor = tf.tensor2d([sensors]);
                const gradients = tf.tidy(() => {
                    return policyNet.getGradientsAndSaveActions(inputTensor).grads;
                  });
                policyNet.pushGradients(gameGradients, gradients);
                
                //define next action
                const policyNetActions = policyNet.getCurrentActions();
                var actionIndex = policyNetActions.reduce((iMax, currentValue, currentIndex, arr) =>
                               currentValue > arr[iMax] ? currentIndex: iMax, 0);
                var action = possibleAction[actionIndex];

                const exploreTurn = (Math.floor(Math.random() * 2) == 1)
                if (exploreTurn){
                    action = possibleAction[Math.floor(Math.random() * possibleAction.length)];
                }
                console.log(action)

                const {reward, done} = await trainingCtrl.update(action);
                gameRewards.push(reward);

                // now we should reward our model with the reward value
                scores[i] += reward
                if (done) {
                    // no more steps
                    break;
                }
            }

            console.log(`End of trainIteration ${i}, score: `, scores[i])

            await tf.nextFrame();

            gameSteps.push(gameRewards.length);
            policyNet.pushGradients(allGradients, gameGradients);
            allRewards.push(gameRewards);
            policyNet.train(allGradients, allRewards);


        } catch (e) {
            console.error(e);
        }
    }
    await trainingCtrl.stop()
    console.log(`Training is over, scores: `, scores)
}


// async function myTrainingFunction(trainingCtrl: rl.TrainingController): Promise<void> {
//     console.log(`Let's training`)

//     const possibleAction = [
//         DIRECTION.FORWARD,
//         DIRECTION.BACKWARD,
//         DIRECTION.LEFT,
//         DIRECTION.RIGHT,
//         DIRECTION.BACKWARD_LEFT,
//         DIRECTION.BACKWARD_RIGHT,
//         DIRECTION.FORWARD_RIGHT,
//         DIRECTION.FORWARD_LEFT,
//     ];
//     const scores = [];

//     for (let i = 0; i < trainIterations; ++i) {
//         try {
//             scores[i] = 0
//             await trainingCtrl.setRandomState();

//             for (let j = 0; j < stepsPerIteration; ++j) {
//                 const sensors = await trainingCtrl.getInputs();

//                 // Define next action
//                 const playerX = sensors[0];
//                 const playerY = sensors[1];
//                 const goalX = sensors[2];
//                 const goalY = sensors[3];

//                 // the sensors would feed or training model, which would return the next action
//                 const action = possibleAction[Math.floor(Math.random() * possibleAction.length)];

//                 // then we pass the action to our update method
//                 const {reward, done} = await trainingCtrl.update(action);
//                 // now we should reward our model with the reward value
//                 scores[i] += reward
//                 if (done) {
//                     // no more steps
//                     console.log(`End of trainIteration ${i}, score: `, scores[i])
//                     break;
//                 }
//             }

//         } catch (e) {
//             console.error(e);
//         }
//     }
//     await trainingCtrl.stop()
//     console.log(`Training is over, scores: `, scores)
// }