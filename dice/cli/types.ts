import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';

export interface GlobalPool {
    // 8 + 32
    admin: PublicKey,
    tokenAddress: PublicKey[],
    tokenCount: anchor.BN
}

export interface UserPool {
    userAddress: PublicKey,
    tokenAddress: PublicKey[],
    tokenAmount: anchor.BN[],
    solAmount: anchor.BN,
}
