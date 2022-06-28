import { Program, web3 } from '@project-serum/anchor';
import * as anchor from '@project-serum/anchor';
import {
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    LAMPORTS_PER_SOL,
    Transaction,
    ParsedAccountData,
    TransactionInstruction,
    sendAndConfirmTransaction
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout, MintLayout, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';
import fs from 'fs';
import { GlobalPool, UserPool } from './types';

const PROGRAM_ID = "77WPfiSfVcYHZQKNUZH6wbB6v1dXieX4upy2UuTMGSj2";
const GLOBAL_AUTHORITY_SEED = "global-authority";
const GAME_VAULT_SEED = "game-vault";
const ESCROW_VAULT_SEED = "escrow-vault";
const USER_POOL_SIZE = 848;

anchor.setProvider(anchor.AnchorProvider.local(web3.clusterApiUrl('devnet')));
const solConnection = anchor.getProvider().connection;
const payer = anchor.AnchorProvider.local().wallet;
console.log(payer.publicKey.toBase58());

const idl = JSON.parse(
    fs.readFileSync(__dirname + "/dice.json", "utf8")
);

let program: Program = null;

// Address of the deployed program.
const programId = new anchor.web3.PublicKey(PROGRAM_ID);

// Generate the program client from IDL.
program = new anchor.Program(idl, programId);
console.log('ProgramId: ', program.programId.toBase58());

const main = async () => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    console.log('GlobalAuthority: ', globalAuthority.toBase58());
    // await initProject(payer.publicKey);
    // await initSolPool(payer.publicKey, 1);
    // await initTokenPool(payer.publicKey, new PublicKey("CFt8zQNRUpK4Lxhgv64JgZ5giZ3VWXSceQr6yKh7VoFU"), 100);
   
    // await initUserPool(payer.publicKey);
    
    // await depositUserSol(payer.publicKey, 1, 3);
    // await depositUserToken(payer.publicKey, new PublicKey("CFt8zQNRUpK4Lxhgv64JgZ5giZ3VWXSceQr6yKh7VoFU"), 1, 10);
   
    // await withdrawUserSol(payer.publicKey, 3, 1);
    // await withdrawUserToken(payer.publicKey, new PublicKey("CFt8zQNRUpK4Lxhgv64JgZ5giZ3VWXSceQr6yKh7VoFU"), 10, 5);

    // console.log(await getGlobalState());
    // console.log(await getUserState(payer.publicKey));

}

export const initProject = async (
    userAddress: PublicKey,
) => {
    const [globalAuthority, gBump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    const [gameVault, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GAME_VAULT_SEED)],
        program.programId
    );

    let tx = new Transaction();
    console.log('==>Initializing program');

    tx.add(program.instruction.initialize(
        {
        accounts: {
            admin: userAddress,
            globalAuthority,
            gameVault,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
        },
        instructions: [],
        signers: [],
    }));

    const { blockhash } = await solConnection.getRecentBlockhash('confirmed');
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    payer.signTransaction(tx);
    let txId = await solConnection.sendTransaction(tx, [(payer as NodeWallet).payer]);
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("txHash =", txId);    
}

export const initSolPool = async (
    userAddress: PublicKey,
    depositAmount: number
) => {
    const [gameVault, _] = await PublicKey.findProgramAddress(
        [Buffer.from(GAME_VAULT_SEED)],
        program.programId
    );

    let tx = new Transaction();
    console.log('==>Initializing Sol Pool');

    tx.add(program.instruction.initSolPool(
        new anchor.BN(depositAmount * LAMPORTS_PER_SOL), {
        accounts: {
            admin: userAddress,
            gameVault,
            systemProgram: SystemProgram.programId,
        },
        instructions: [],
        signers: [],
    }));

    const { blockhash } = await solConnection.getRecentBlockhash('confirmed');
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    payer.signTransaction(tx);
    let txId = await solConnection.sendTransaction(tx, [(payer as NodeWallet).payer]);
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("txHash =", txId);    
}

export const initTokenPool = async (
    userAddress: PublicKey,
    tokenMint: PublicKey,
    tokenAmount: number
) => {
    const [globalAuthority, gBump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    const [gameVault, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GAME_VAULT_SEED)],
        program.programId
    );

    let decimals = await getDecimals(userAddress, tokenMint);
    let adminTokenAccount = await getAssociatedTokenAccount(userAddress, tokenMint);

    let { instructions, destinationAccounts } = await getATokenAccountsNeedCreate(
        solConnection,
        userAddress,
        gameVault,
        [tokenMint]
    );

    let tx = new Transaction();
    console.log('==>Initializing Token Pool');

    if (instructions.length > 0) instructions.map((ix) => tx.add(ix));

    tx.add(program.instruction.initTokenPool(
        new anchor.BN(tokenAmount * decimals), {
        accounts: {
            admin: userAddress,
            gameVault,
            adminTokenAccount,
            vaultTokenAccount: destinationAccounts[0],
            globalAuthority,
            tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [],
        signers: [],
    }));

    const { blockhash } = await solConnection.getRecentBlockhash('confirmed');
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    payer.signTransaction(tx);
    let txId = await solConnection.sendTransaction(tx, [(payer as NodeWallet).payer]);
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("txHash =", txId);    
}

export const initUserPool = async (
    userAddress: PublicKey,
) => {
    const [escrowVault, bump] = await PublicKey.findProgramAddress(
        [userAddress.toBuffer(), Buffer.from(ESCROW_VAULT_SEED)],
        program.programId
    );

    let userPool = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );

    let ix = SystemProgram.createAccountWithSeed({
        fromPubkey: userAddress,
        basePubkey: userAddress,
        seed: "user-pool",
        newAccountPubkey: userPool,
        lamports: await solConnection.getMinimumBalanceForRentExemption(USER_POOL_SIZE),
        space: USER_POOL_SIZE,
        programId: program.programId,
    });
    let tx = new Transaction();
    console.log('==>Initializing User Pool');

    tx.add(ix);
    tx.add(program.instruction.initUserPool(
        {
        accounts: {
            user: userAddress,
            escrowVault,
            userPool,
            systemProgram: SystemProgram.programId,
        },
        instructions: [],
        signers: [],
    }));

    const { blockhash } = await solConnection.getRecentBlockhash('confirmed');
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    payer.signTransaction(tx);
    let txId = await solConnection.sendTransaction(tx, [(payer as NodeWallet).payer]);
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("txHash =", txId);    
}

export const depositUserSol = async (
    userAddress: PublicKey,
    exAmount: number,
    depositAmount: number,
) => {
    const [escrowVault, escrowBump] = await PublicKey.findProgramAddress(
        [userAddress.toBuffer(), Buffer.from(ESCROW_VAULT_SEED)],
        program.programId
    );

    const [gameVault, gameBump] = await PublicKey.findProgramAddress(
        [Buffer.from(GAME_VAULT_SEED)],
        program.programId
    );

    let userPool = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );
 
    let tx = new Transaction();
    console.log('==>Depositing User Sol');


    tx.add(program.instruction.depositUserSol(
        escrowBump, gameBump, new anchor.BN(exAmount*LAMPORTS_PER_SOL), new anchor.BN(depositAmount*LAMPORTS_PER_SOL), {
        accounts: {
            user: userAddress,
            escrowVault,
            gameVault,
            userPool,
            systemProgram: SystemProgram.programId,
        },
        instructions: [],
        signers: [],
    }));

    const { blockhash } = await solConnection.getRecentBlockhash('confirmed');
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    payer.signTransaction(tx);
    let txId = await solConnection.sendTransaction(tx, [(payer as NodeWallet).payer]);
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("txHash =", txId);    
}

export const depositUserToken = async (
    userAddress: PublicKey,
    tokenMint: PublicKey,
    exAmount: number,
    depositAmount: number,
) => {
    const [escrowVault, escrowBump] = await PublicKey.findProgramAddress(
        [userAddress.toBuffer(), Buffer.from(ESCROW_VAULT_SEED)],
        program.programId
    );

    const [gameVault, gameBump] = await PublicKey.findProgramAddress(
        [Buffer.from(GAME_VAULT_SEED)],
        program.programId
    );

    const [globalAuthority, Bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );

    let userPool = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );
 
    let decimals = await getDecimals(userAddress, tokenMint);

    let tx = new Transaction();
    console.log('==>Depositing User Token');

    let userTokenAccount = await getAssociatedTokenAccount(userAddress, tokenMint);
    let gameTokenAccount = await getAssociatedTokenAccount(gameVault, tokenMint);
    let { instructions, destinationAccounts } = await getATokenAccountsNeedCreate(
        solConnection,
        userAddress,
        escrowVault,
        [tokenMint]
    );

    if (instructions.length > 0) instructions.map((ix) => tx.add(ix));
    tx.add(program.instruction.depositUserToken(
        escrowBump, gameBump, new anchor.BN(exAmount*decimals), new anchor.BN(depositAmount*decimals), {
        accounts: {
            user: userAddress,
            escrowVault,
            gameVault,
            userPool,
            globalAuthority,
            userTokenAccount,
            vaultTokenAccount: destinationAccounts[0],
            gameTokenAccount,
            tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [],
        signers: [],
    }));

    const { blockhash } = await solConnection.getRecentBlockhash('confirmed');
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    payer.signTransaction(tx);
    let txId = await solConnection.sendTransaction(tx, [(payer as NodeWallet).payer]);
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("txHash =", txId);    
}

export const withdrawUserSol = async (
    userAddress: PublicKey,
    exAmount: number,
    withdrawAmount: number,
) => {
    const [escrowVault, escrowBump] = await PublicKey.findProgramAddress(
        [userAddress.toBuffer(), Buffer.from(ESCROW_VAULT_SEED)],
        program.programId
    );

    const [gameVault, gameBump] = await PublicKey.findProgramAddress(
        [Buffer.from(GAME_VAULT_SEED)],
        program.programId
    );

    let userPool = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );
 
    let tx = new Transaction();
    console.log('==>Withdrawing User Sol');


    tx.add(program.instruction.withdrawUserSol(
        escrowBump, gameBump, new anchor.BN(exAmount*LAMPORTS_PER_SOL), new anchor.BN(withdrawAmount*LAMPORTS_PER_SOL), {
        accounts: {
            user: userAddress,
            escrowVault,
            gameVault,
            userPool,
            systemProgram: SystemProgram.programId,
        },
        instructions: [],
        signers: [],
    }));

    const { blockhash } = await solConnection.getRecentBlockhash('confirmed');
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    payer.signTransaction(tx);
    let txId = await solConnection.sendTransaction(tx, [(payer as NodeWallet).payer]);
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("txHash =", txId);    
}

export const withdrawUserToken = async (
    userAddress: PublicKey,
    tokenMint: PublicKey,
    exAmount: number,
    depositAmount: number,
) => {
    const [escrowVault, escrowBump] = await PublicKey.findProgramAddress(
        [userAddress.toBuffer(), Buffer.from(ESCROW_VAULT_SEED)],
        program.programId
    );

    const [gameVault, gameBump] = await PublicKey.findProgramAddress(
        [Buffer.from(GAME_VAULT_SEED)],
        program.programId
    );

    const [globalAuthority, Bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );

    let userPool = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );
 
    let decimals = await getDecimals(escrowVault, tokenMint);

    let tx = new Transaction();
    console.log('==>Withdrawing User Token');

    let vaultTokenAccount = await getAssociatedTokenAccount(escrowVault, tokenMint);
    let gameTokenAccount = await getAssociatedTokenAccount(gameVault, tokenMint);
    let { instructions, destinationAccounts } = await getATokenAccountsNeedCreate(
        solConnection,
        userAddress,
        userAddress,
        [tokenMint]
    );

    if (instructions.length > 0) instructions.map((ix) => tx.add(ix));
    tx.add(program.instruction.withdrawUserToken(
        escrowBump, gameBump, new anchor.BN(exAmount*decimals), new anchor.BN(depositAmount*decimals), {
        accounts: {
            user: userAddress,
            escrowVault,
            gameVault,
            userPool,
            globalAuthority,
            userTokenAccount: destinationAccounts[0],
            vaultTokenAccount,
            gameTokenAccount,
            tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [],
        signers: [],
    }));

    const { blockhash } = await solConnection.getRecentBlockhash('confirmed');
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    payer.signTransaction(tx);
    let txId = await solConnection.sendTransaction(tx, [(payer as NodeWallet).payer]);
    await solConnection.confirmTransaction(txId, "confirmed");
    console.log("txHash =", txId);    
}

export const getGlobalState = async (
): Promise<GlobalPool | null> => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    try {
        let globalState = await program.account.globalPool.fetch(globalAuthority);
        return globalState  as unknown as GlobalPool;
    } catch {
        return null;
    }
}

export const getUserState = async (
    userAddress: PublicKey
): Promise<UserPool | null> => {
    if (!userAddress) return null;

    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );
    try {
        let poolState = await program.account.userPool.fetch(userPoolKey);
        return poolState as unknown as UserPool;
    } catch {
        return null;
    }
}





export const getDecimals = async (owner: PublicKey, tokenMint: PublicKey): Promise<number | null> => {
    try {
        let ownerTokenAccount = await getAssociatedTokenAccount(owner, tokenMint);
        const tokenAccount = await solConnection.getParsedAccountInfo(ownerTokenAccount);
        let decimal = (tokenAccount.value?.data as ParsedAccountData).parsed.info.tokenAmount.decimals;
        let DECIMALS = Math.pow(10, decimal);
        return DECIMALS;
    } catch {
        return null;
    }
}

const getAssociatedTokenAccount = async (ownerPubkey: PublicKey, mintPk: PublicKey): Promise<PublicKey> => {
    let associatedTokenAccountPubkey = (await PublicKey.findProgramAddress(
        [
            ownerPubkey.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            mintPk.toBuffer(), // mint address
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    ))[0];
    return associatedTokenAccountPubkey;
}

export const getATokenAccountsNeedCreate = async (
    connection: anchor.web3.Connection,
    walletAddress: anchor.web3.PublicKey,
    owner: anchor.web3.PublicKey,
    nfts: anchor.web3.PublicKey[],
) => {
    let instructions = [], destinationAccounts = [];
    for (const mint of nfts) {
        const destinationPubkey = await getAssociatedTokenAccount(owner, mint);
        let response = await connection.getAccountInfo(destinationPubkey);
        if (!response) {
            const createATAIx = createAssociatedTokenAccountInstruction(
                destinationPubkey,
                walletAddress,
                owner,
                mint,
            );
            instructions.push(createATAIx);
        }
        destinationAccounts.push(destinationPubkey);
        if (walletAddress != owner) {
            const userAccount = await getAssociatedTokenAccount(walletAddress, mint);
            response = await connection.getAccountInfo(userAccount);
            if (!response) {
                const createATAIx = createAssociatedTokenAccountInstruction(
                    userAccount,
                    walletAddress,
                    walletAddress,
                    mint,
                );
                instructions.push(createATAIx);
            }
        }
    }
    return {
        instructions,
        destinationAccounts,
    };
}

export const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress: anchor.web3.PublicKey,
    payer: anchor.web3.PublicKey,
    walletAddress: anchor.web3.PublicKey,
    splTokenMintAddress: anchor.web3.PublicKey
) => {
    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
        { pubkey: walletAddress, isSigner: false, isWritable: false },
        { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
        {
            pubkey: anchor.web3.SystemProgram.programId,
            isSigner: false,
            isWritable: false,
        },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
            pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
            isSigner: false,
            isWritable: false,
        },
    ];
    return new anchor.web3.TransactionInstruction({
        keys,
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.from([]),
    });
}

main()