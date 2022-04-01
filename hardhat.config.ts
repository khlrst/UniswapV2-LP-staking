/* eslint-disable node/no-missing-import */
/* eslint-disable prettier/prettier */
/* eslint-disable no-unused-vars */
import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import { NetworkUserConfig } from 'hardhat/types';

import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import 'hardhat-contract-sizer';
import "solidity-coverage";

dotenv.config();

// Ensure everything is in place
let mnemonic: string;
if (!process.env.MNEMONIC) {
  throw new Error('Please set your MNEMONIC in a .env file')
} else {
  mnemonic = process.env.MNEMONIC;
}
let INFURA_KEY: string;
if (!process.env.INFURA_KEY) {
  throw new Error('Please set your INFURA_KEY in a .env file')
} else {
    INFURA_KEY = process.env.INFURA_KEY;
}
let ALCHEMY_KEY: string;
if (!process.env.ALCHEMY_KEY) {
  throw new Error('Please set your ALCHEMY_KEY in a .env file')
} else {
    ALCHEMY_KEY = process.env.ALCHEMY_KEY;
}


//define chainIds for networks 
const chainIds = {
    hardhat: 31337,
    ganache: 1337,
    rinkeby : 4,
    kovan: 42,
    mainnet: 1,
} 

function createNetworkConfig(
        network: keyof typeof chainIds,
    ): NetworkUserConfig {
        const url: string = `https://${network}.infura.io/v3/${INFURA_KEY}`;
        return {
        accounts: {
            count: 10,
            initialIndex: 0,
            mnemonic,
            path: "m/44'/60'/0'/0",
        },
        chainId: chainIds[network],
        gas: "auto",
        gasPrice: 30_000_000_000, // gwei
        url,
        };
    }


const config: HardhatUserConfig = {
    solidity: "0.8.11",
    networks: {
        hardhat: {
            forking: {
                url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_KEY}`,
                blockNumber: 12883802
            }
        },
        mainnet: createNetworkConfig('mainnet'),
        kovan: createNetworkConfig('kovan'),
        rinkeby: createNetworkConfig('rinkeby')
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY
    },
    mocha: {
        grep: '^(?!.*; using Ganache).*'
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: false,
    }
};

export default config;
