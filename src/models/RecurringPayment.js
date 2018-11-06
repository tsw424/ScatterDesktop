import IdGenerator from '../util/IdGenerator';
import Token from './Token';
import {store} from '../store/store'

/***
 * Used only when cycles are specified.
 * Keeps track or total vs current cycle.
 */
export class RecurringCycle {

	constructor(){
		this.total = 0;
		this.current = 0;
	}

	static placeholder(){ return new RecurringCycle(); }
	static fromJson(json){ return Object.assign(this.placeholder(), json); }
}

export default class RecurringPayment {

	constructor(token, recipient, amount, accountUnique, networkUnique, intervalInSeconds = 0, totalCycles = 0, options = {}){
		this.id = IdGenerator.text(24);
		this.token = token;
		this.recipient = recipient;
		this.amount = amount;

		// Whether the user wants to prompt this
		// transaction each time, or do it automatically.
		this.promptEachTime = false;

		this.accountUnique = accountUnique;
		this.networkUnique = networkUnique;

		// Optional things like "memo"
		// used for specific blockchains
		this.options = options;

		// Total 0 for infinite
		this.cycles = totalCycles
			? RecurringCycle.fromJson({total:totalCycles})
			: RecurringCycle.placeholder();

		// Used to check if a contract has changed since approval
		// If it has it requires the user re-authenticate the payment.
		this.contractHash = null;

		// This is in seconds
		this.interval = intervalInSeconds;
		// Timestamp of latest payment
		this.lastPayment = +new Date();

		// If this payment is currently being processed and watched.
		this.processing = false;

		// An array of transaction hashes for lookups
		this.hashes = [];

		// Original creation date
		this.createdAt = +new Date();

		// applink key, only available if done from a dapp
		this.createdBy = null;

		// Used to display errors to the user.
		this.error = null;
	}

	static placeholder(){ return new RecurringPayment(); }
	static fromJson(json){
		const p = Object.assign(this.placeholder(), json);
		p.token = Token.placeholder(json.token);
		p.cycles = RecurringCycle.fromJson(json.cycles);
		return p;
	}

	account(){
		return store.state.scatter.keychain.accounts.find(x => x.unique() === this.accountUnique);
	}

	network(){
		return store.state.scatter.settings.networks.find(x => x.unique() === this.networkUnique);
	}

	nextPaymentTime(){
		return this.lastPayment + (this.interval*1000);
	}

	isWithinTimePeriod(maxFromNowInSeconds){
		if(this.processing) return false;
		if(this.cycles.total > 0 && this.cycles.current >= this.cycles.total) return false;
		const now = +new Date();
		return this.nextPaymentTime() < now + (maxFromNowInSeconds*1000);
	}

	timeLeft(){
		return this.nextPaymentTime() - (+new Date());
	}

}