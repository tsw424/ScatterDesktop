import {store} from '../store/store';
import * as Actions from '../store/constants';
import PluginRepository from "../plugins/PluginRepository";
import PopupService from "./PopupService";
import TransferService from "./TransferService";
import {Popup} from "../models/popups/Popup";

let mainTimeout;
let timeouts = [];

const clearTimeouts = () => {
	timeouts.map(x => clearTimeout(x));
	timeouts = [];
}

// Time Period
// const timePeriod = 1000*60*60;
const timePeriod = 10000;

export default class RecurringPaymentsService {

	static addPayment(payment){
		return this.updatePayment(payment);
	}

	static updatePayment(payment){
		const scatter = store.state.scatter.clone();
		scatter.keychain.updateOrPushRecurringPayment(payment);
		return store.dispatch(Actions.SET_SCATTER, scatter);
	}

	static removePayment(payment){
		const scatter = store.state.scatter.clone();
		scatter.keychain.removeRecurringPayment(payment);
		return store.dispatch(Actions.SET_SCATTER, scatter);
	}

	static watchPayments(){
		clearTimeout(mainTimeout);
		clearTimeouts();

		const upcomingPayments = store.state.scatter.keychain.recurringPayments
			.filter(payment => payment.isWithinTimePeriod(timePeriod));

		upcomingPayments.map(payment => {
			if(payment.timeLeft() <= 0) this.pay(payment);
			else timeouts.push(setTimeout(() => this.pay(payment), payment.timeLeft()));
		});

		mainTimeout = setTimeout(() => this.watchPayments(), timePeriod);
	}

	static async pay(payment){
		console.log('paying for payment', payment);

		// Already processing this payment.
		if(payment.processing) return;
		payment.processing = true;
		this.updatePayment(payment);

		const plugin = PluginRepository.plugin(payment.token.blockchain);

		const isFirstPayment = payment.cycles.current === 0;
		const transferTokens = async (showPopup = false) => {
			const transactionHash = await TransferService[payment.token.blockchain]({
				account:payment.account(),
				recipient:payment.recipient,
				amount:payment.amount,
				memo:payment.options.hasOwnProperty('memo') ? payment.options.memo : '',
				token:payment.token,
				prompt:showPopup,
				returnOnly:true,
			});

			if(!transactionHash) {
				payment.error = 'Payment Failure';
				this.updatePayment(payment);
				return false;
			}

			setTimeout(() => this.watchPayment(payment, transactionHash), plugin.baseConfirmationTime());
			return true;
		};

		if(plugin.hasUpdatableContracts()) {
			const hash = await plugin.getContractHash(payment.network(), payment.token.account);

			const setHash = async () => {
				payment.contractHash = hash;
				this.updatePayment(payment);
			};

			// First payment
			if(isFirstPayment){
				await setHash(hash);
			} else {
				if(hash !== payment.contractHash){
					PopupService.push(Popup.prompt(
						'You need to re-authorize this recurring payment!',
						`The contract under this payment has changed and you must re-authorize the payment again to make sure it's still what you expect.`,
						'exclamation-triangle',
						'Okay',
						async approved => {
							if(!approved) return this.removePayment(payment);
							if(await transferTokens(true)) await setHash(hash);
						},
						'Remove'
					));
					return false;
				}
			}
		}

		//... Send tokens
		await transferTokens(isFirstPayment || payment.promptEachTime);
	}

	static async watchPayment(payment, hash, tries = 0){
		if(tries >= 5) {
			// Payment failed?
			return;
		}
		const plugin = PluginRepository.plugin(payment.token.blockchain);
		const transactionCompleted = await plugin.hasTransactionCompleted(payment.network(), hash);
		if(!transactionCompleted) return setTimeout(() => this.watchPayment(payment, hash, tries++), 30000);

		const scatter = store.state.scatter.clone();
		payment.processing = false;
		payment.lastPayment = +new Date();
		if(payment.cycles) payment.cycles.current++;
		scatter.keychain.updateOrPushRecurringPayment(payment);
	}

	static async removeAll(){
		const scatter = store.state.scatter.clone();
		scatter.keychain.recurringPayments = [];
		await store.dispatch(Actions.SET_SCATTER, scatter);
		clearTimeouts();
		return true;
	}

}