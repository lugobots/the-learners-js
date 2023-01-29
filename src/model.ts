import * as tf from '@tensorflow/tfjs-node';
import {rl} from "@lugobots/lugo4node";

/**
 * Policy network for controlling the cart-pole system.
 *
 * The role of the policy network is to select an action based on the observed
 * state of the system. In this case, the action is the leftward or rightward
 * force and the observed system state is a four-dimensional vector, consisting
 * of cart position, cart velocity, pole angle and pole angular velocity.
 *
 */
export class PolicyNetwork {

    protected policyNet;
    private currentActions_;
    private optimizer;

    /**
     * Constructor of PolicyNetwork.
     *
     * @param {number | number[] | tf.LayersModel} hiddenLayerSizes
     *   Can be any of the following
     *   - Size of the hidden layer, as a single number (for a single hidden
     *     layer)
     *   - An Array of numbers (for any number of hidden layers).
     *   - An instance of tf.LayersModel.
     */
    constructor(hiddenLayerSizesOrModel, actionsSize, learningRate) {
        if (hiddenLayerSizesOrModel instanceof tf.LayersModel) {
            this.policyNet = hiddenLayerSizesOrModel;
        } else {
            this.createPolicyNetwork(hiddenLayerSizesOrModel, actionsSize, learningRate);
        }
    }

    /**
     * Create the underlying model of this policy network.
     *
     * @param {number | number[]} hiddenLayerSizes Size of the hidden layer, as
     *   a single number (for a single hidden layer) or an Array of numbers (for
     *   any number of hidden layers).
     */
    createPolicyNetwork(hiddenLayerSizes, actionsSize, learningRate) {
        if (!Array.isArray(hiddenLayerSizes)) {
            hiddenLayerSizes = [hiddenLayerSizes];
        }
        this.policyNet = tf.sequential();
        hiddenLayerSizes.forEach((hiddenLayerSize, i) => {
            console.log('LAYERS, ', i, hiddenLayerSize)
            this.policyNet.add(tf.layers.dense({
                units: hiddenLayerSize,
                activation: 'elu',
                // `inputShape` is required only for the first layer.
                inputShape: i === 0 ? [4] : undefined
            }));
        });
        // The last layer size should match the number of actions!!
        this.policyNet.add(tf.layers.dense({units: actionsSize}));

        this.optimizer = tf.train.adam(learningRate);
    }

    train(allGradients, allRewards){
        tf.tidy(() => {
            // The following line does three things:
            // 1. Performs reward discounting, i.e., make recent rewards count more
            //    than rewards from the further past. The effect is that the reward
            //    values from a game with many steps become larger than the values
            //    from a game with fewer steps.
            // 2. Normalize the rewards, i.e., subtract the global mean value of the
            //    rewards and divide the result by the global standard deviation of
            //    the rewards. Together with step 1, this makes the rewards from
            //    long-lasting games positive and rewards from short-lasting
            //    negative.
            // 3. Scale the gradients with the normalized reward values.
            const normalizedRewards = discountAndNormalizeRewards(allRewards, 0.99);
            // Add the scaled gradients to the weights of the policy network. This
            // step makes the policy network more likely to make choices that lead
            // to long-lasting games in the future (i.e., the crux of this RL
            // algorithm.)
            this.optimizer.applyGradients(
                scaleAndAverageGradients(allGradients, normalizedRewards));
        });
        tf.dispose(allGradients);
    }

    public getGradientsAndSaveActions(inputTensor) {
        const f = () => tf.tidy(() => {
            const [logits, actions] = this.getLogitsAndActions(inputTensor);
            this.currentActions_ = actions.dataSync();
            const labels =
                tf.sub(1, tf.tensor2d(this.currentActions_, actions.shape));
            return tf.losses.sigmoidCrossEntropy(labels, logits).asScalar();
        });
        return tf.variableGrads(f);
    }

    getCurrentActions() {
        return this.currentActions_;
    }

    /**
     * Get policy-network logits and the action based on state-tensor inputs.
     *
     * @param {tf.Tensor} inputs A tf.Tensor instance of shape `[batchSize, 4]`.
     * @returns {[tf.Tensor, tf.Tensor]}
     *   1. The logits tensor, of shape `[batchSize, actionsSize]`.
     *   2. The actions tensor, of shape `[batchSize, actionsSize]`.
     */
    getLogitsAndActions(inputs) {
        return tf.tidy(() => {
            const logits = this.policyNet.predict(inputs);

            // Get the probability of the leftward action.
            const leftProb = tf.softmax(logits);
            // Probabilites of the left and right actions.
            // const leftRightProbs = tf.concat([leftProb, tf.sub(1, leftProb)], 1);
            // console.log(leftRightProbs)
            // const actions = tf.multinomial(leftRightProbs, 1, null, true);
            // return [logits, actions];
            return [logits, leftProb];
        });
    }

    /**
     * Get actions based on a state-tensor input.
     *
     * @param {tf.Tensor} inputs A tf.Tensor instance of shape `[batchSize, 4]`.
     * @param {Float32Array} inputs The actions for the inputs, with length
     *   `batchSize`.
     */
    getActions(inputs) {
        return this.getLogitsAndActions(inputs)[1].dataSync();
    }

    /**
     * Push a new dictionary of gradients into records.
     *
     * @param {{[varName: string]: tf.Tensor[]}} record The record of variable
     *   gradient: a map from variable name to the Array of gradient values for
     *   the variable.
     * @param {{[varName: string]: tf.Tensor}} gradients The new gradients to push
     *   into `record`: a map from variable name to the gradient Tensor.
     */
    pushGradients(record, gradients) {
        for (const key in gradients) {
            if (key in record) {
                record[key].push(gradients[key]);
            } else {
                record[key] = [gradients[key]];
            }
        }
    }
}

/**
 * Discount the reward values.
 *
 * @param {number[]} rewards The reward values to be discounted.
 * @param {number} discountRate Discount rate: a number between 0 and 1, e.g.,
 *   0.95.
 * @returns {tf.Tensor} The discounted reward values as a 1D tf.Tensor.
 */
function discountRewards(rewards, discountRate) {
    const discountedBuffer = tf.buffer([rewards.length]);
    let prev = 0;
    for (let i = rewards.length - 1; i >= 0; --i) {
        const current = discountRate * prev + rewards[i];
        discountedBuffer.set(current, i);
        prev = current;
    }
    return discountedBuffer.toTensor();
}

/**
 * Discount and normalize reward values.
 *
 * This function performs two steps:
 *
 * 1. Discounts the reward values using `discountRate`.
 * 2. Normalize the reward values with the global reward mean and standard
 *    deviation.
 *
 * @param {number[][]} rewardSequences Sequences of reward values.
 * @param {number} discountRate Discount rate: a number between 0 and 1, e.g.,
 *   0.95.
 * @returns {tf.Tensor[]} The discounted and normalize reward values as an
 *   Array of tf.Tensor.
 */
function discountAndNormalizeRewards(rewardSequences, discountRate) {
    return tf.tidy(() => {
        const discounted = [];
        for (const sequence of rewardSequences) {
            discounted.push(discountRewards(sequence, discountRate))
        }
        // Compute the overall mean and stddev.
        const concatenated = tf.concat(discounted);
        const mean = tf.mean(concatenated);
        const std = tf.sqrt(tf.mean(tf.square(concatenated.sub(mean))));
        // Normalize the reward sequences using the mean and std.
        const normalized = discounted.map(rs => rs.sub(mean).div(std));
        return normalized;
    });
}

/**
 * Scale the gradient values using normalized reward values and compute average.
 *
 * The gradient values are scaled by the normalized reward values. Then they
 * are averaged across all games and all steps.
 *
 * @param {{[varName: string]: tf.Tensor[][]}} allGradients A map from variable
 *   name to all the gradient values for the variable across all games and all
 *   steps.
 * @param {tf.Tensor[]} normalizedRewards An Array of normalized reward values
 *   for all the games. Each element of the Array is a 1D tf.Tensor of which
 *   the length equals the number of steps in the game.
 * @returns {{[varName: string]: tf.Tensor}} Scaled and averaged gradients
 *   for the variables.
 */
function scaleAndAverageGradients(allGradients, normalizedRewards) {
        const gradients = {};
        for (const varName in allGradients) {
            gradients[varName] = tf.tidy(() => {
                // Stack gradients together.
                const varGradients = allGradients[varName].map(
                    varGameGradients => tf.stack(varGameGradients));
                // Expand dimensions of reward tensors to prepare for multiplication
                // with broadcasting.
                const expandedDims = [];
                for (let i = 0; i < varGradients[0].rank - 1; ++i) {
                    expandedDims.push(1);
                }
                const reshapedNormalizedRewards = normalizedRewards.map(
                    rs => rs.reshape(rs.shape.concat(expandedDims)));
                for (let g = 0; g < varGradients.length; ++g) {
                    // This mul() call uses broadcasting.
                    varGradients[g] = varGradients[g].mul(reshapedNormalizedRewards[g]);
                }
                // Concatenate the scaled gradients together, then average them across
                // all the steps of all the games.
                return tf.mean(tf.concat(varGradients, 0), 0);
            });
        }
        return gradients;
}

export function mean(xs) {
    return sum(xs) / xs.length;
}

/**
 * Calculate the sum of an Array of numbers.
 *
 * @param {number[]} xs
 * @returns {number} The sum of `xs`.
 * @throws Error if `xs` is empty.
 */
export function sum(xs) {
    if (xs.length === 0) {
        throw new Error('Expected xs to be a non-empty Array.');
    } else {
        return xs.reduce((x, prev) => prev + x);
    }
}

async function asyncToSync(asyncOriginalFunc) {
    const result = await asyncOriginalFunc()
    return () => {
        return result;
    }
}