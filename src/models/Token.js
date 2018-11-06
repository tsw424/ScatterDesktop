import {Blockchains} from "./Blockchains";
import PluginRepository from '../plugins/PluginRepository'

export default class Token {

	constructor(blockchain = Blockchains.EOSIO, account = 'eosio.token', symbol = 'EOS', decimals = null, name = null){
		this.blockchain = blockchain;
		this.account = account;
		this.symbol = symbol;
		this.decimals = decimals ? decimals : PluginRepository.plugin(blockchain).defaultDecimals();
		this.name = name ? name : symbol;
	}

	static placeholder(){ return new Token(); }
	static fromJson(json){ return Object.assign(this.placeholder(), json); }

}