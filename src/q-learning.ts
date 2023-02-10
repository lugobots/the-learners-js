import * as seedrandom from "seedrandom"
import * as fs from "fs"
import {inflateSync, deflateSync} from 'node:zlib'
/*
 * https://en.wikipedia.org/wiki/Q-learning
 * http://mnemstudio.org/path-finding-q-learning-tutorial.htm
 */

//https://github.com/nrox/q-learning.js/blob/master/q-learning.js
export class RandomGenerator {
    private generator;

    constructor(seed: string = ".") {
        this.generator = seedrandom(seed)
    }

    random() {
        return this.generator()
    }

    setSeed(seed) {
        this.generator = seedrandom(seed)
    }
}

const generator = new RandomGenerator()

export class Action {
    private nextState: any;
    private reward: any;
    private name: any;

    constructor(nextState, reward, name) {
        this.nextState = nextState;
        this.reward = reward;
        this.name = name;
    }
}

export class State {
    private name: any;

    private actions: {};

    private actionsList: any[];

    constructor(name) {
        this.name = name
        this.actions = {}
        this.actionsList = []
    }

    addAction(nextState, reward, name) {
        let action = new Action(nextState, reward, name)
        this.actions[name] = action
        this.actionsList.push(action)
        return action
    }

    randomAction = () => {
        let index = Math.floor(this.actionsList.length * generator.random())
        return this.actionsList[index]
    }
}

export class QLearner {
    private gamma: any;
    private alpha: any;
    private qValuesTable: any;
    private states: any;
    private statesList: any;
    private currentState: any;

    /**
     * https://en.wikipedia.org/wiki/Q-learning
     *
     * @param {number} gamma The discount factor
     * @param {number} alpha The learning rate
     */
    constructor(gamma, alpha) {
        this.gamma = gamma || 0.8
        this.alpha = alpha || 0.8

        //qValuesTable is a map {state#: {action#: q-value, ...}, ...}
        this.qValuesTable = {}
        this.states = {}
        this.statesList = []
        this.currentState = null
    }

    save(path) {
        // console.log(this.qValuesTable)
        const serialised = JSON.stringify(this.qValuesTable)
        // const input = new Buffer(serialised)
        // const data = deflateSync(serialised) .toString('utf8')
        fs.writeFileSync(path, serialised)
    }

    load(path) {
        if (!fs.existsSync(path)) {
            fs.writeFileSync(path, '{}')
        }
        const data = fs.readFileSync(path, {encoding: 'utf8'})
        // const serialised = inflateSync(data).toString('utf8')
        // console.log(serialised)
        this.qValuesTable = JSON.parse(data)
    }


    /**
     * Add an action from (state) to (state), with a predefined reward.
     */
    add(from, to, reward, actionName) {
        if (!this.states[from]) this.addState(from)
        if (!this.states[to]) this.addState(to)
        this.setQValue(from, actionName, reward)
        return this.states[from].addAction(to, reward, actionName)
    }

    addState(name) {
        let state = new State(name);
        this.states[name] = state;
        this.statesList.push(state);
        return state;
    }

    setState(name) {
        this.currentState = this.states[name] || new State(name)
        return this.currentState
    }

    getState() {
        return this.currentState && this.currentState.name
    }

    randomState() {
        let index = Math.floor(this.statesList.length * generator.random())
        return this.statesList[index]
    }

    /**
     * The maximum reward achievable from the state, by looking at the q-values table.
     */
    optimalFutureValue(state) {
        let qValues = this.qValuesTable[state]
        let max = 0
        for (let action in qValues) {
            if (qValues.hasOwnProperty(action)) {
                max = Math.max(max, qValues[action] || 0)
            }
        }
        return max;
    }

    /**
     * If there are defined rewards for the action, from the state.
     */
    knowsAction(state, action) {
        return (this.qValuesTable[state] || {}).hasOwnProperty(action)
    }

    /**
     * From current state, apply the action (name), and set the action's next state as current state.
     */
    applyAction(name) {
        let actionObject = this.states[this.currentState.name].actions[name];
        if (actionObject) {
            this.currentState = this.states[actionObject.nextState];
        }
        return actionObject && this.currentState;
    }

    /**
     * Get the best action from the state (name), which is the one with immediate best Q-value.
     * During the selection process, if states have the same reward, choose one with probability 50%.
     */
    bestAction(state) {
        let qValues = this.qValuesTable[state] || {}
        let bestAction = null;
        for (let action in qValues) {
            if (qValues.hasOwnProperty(action)) {
                if (!bestAction) {
                    bestAction = action
                } else if ((qValues[action] == qValues[bestAction]) && (generator.random() > 0.5)) {
                    bestAction = action
                } else if (qValues[action] > qValues[bestAction]) {
                    bestAction = action
                }
            }
        }
        return bestAction
    }

    predictAction(state) {
        let qValues = this.qValuesTable[state] || {}
        let prediction = null;
        for (let action in qValues) {
            if (qValues.hasOwnProperty(action)) {
                if (!prediction) {
                    prediction = action
                } else if (qValues[action] > qValues[prediction]) {
                    prediction = action
                }
            }
        }
        return prediction
    }

    /**
     * From current state, choose the best action and apply it,
     * doing a transition for the next state and setting this as currentState
     */
    runOnce() {
        let bestActionName = this.bestAction(this.currentState.name);
        if (!bestActionName) return undefined
        let action = this.states[this.currentState.name].actions[bestActionName];
        if (action) {
            this.currentState = this.states[action.nextState];
        }
        return action && this.currentState;
    }

    /**
     * Set a reward (Q-Value) for performing the action from a state
     */
    setQValue(stateName, actionName, reward) {
        if (!this.qValuesTable[stateName]) this.qValuesTable[stateName] = {}
        this.qValuesTable[stateName][actionName] = reward
    }

    getQValue(stateName, actionName) {
        if (!this.qValuesTable[stateName]) return 0.0
        return this.qValuesTable[stateName][actionName] || 0.0
    }

    /**
     * Do a single learning step from current state.
     */
    step() {

        //set current state randomly if not defined
        if (!this.currentState) this.currentState = this.randomState()
        if (!this.currentState) return null;
        let state = this.currentState

        //get some random action from current state
        let action = state.randomAction();
        if (!action) return null;

        //immediate reward for the action
        let actionReward = action.reward || 0

        //optimal future value, by looking at the q-values table, for the
        let maxQValue = this.optimalFutureValue(action.nextState)
        let oldQValue = this.getQValue(state.name, action.name)
        let newQValue = (1 - this.alpha) * oldQValue + this.alpha * (actionReward + this.gamma * maxQValue)

        //update q-values table
        this.setQValue(state.name, action.name, newQValue)

        this.currentState = this.states[action.nextState]
        return this.currentState
    }

    /**
     * Apply the learning process #steps, from random states.
     */
    learn(steps) {
        steps = Math.max(1, steps || 0)
        while (steps--) {
            this.currentState = this.randomState()
            this.step()
        }
    }
}
