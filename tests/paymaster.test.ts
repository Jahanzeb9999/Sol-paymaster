import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Mawari } from "../target/types/mawari";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js"; 
import { readFileSync } from "fs";  // Ensure we import readFileSync correctly

import {  setAuthority, AuthorityType, transfer } from "@solana/spl-token";

import { getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, createMintToInstruction, createAssociatedTokenAccountInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { assert, use } from "chai";


describe("Mawari", () => {
  // Initialize provider first
  // Load the keypair from the specified path
// Set up the Anchor provider to use this wallet
const keypairPath = "/Users/jay/.config/solana/my-wallet.json";
const secretKey = Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf-8"))); // No conflict here
const payer = anchor.web3.Keypair.fromSecretKey(secretKey); // This will be the wallet

const provider = new anchor.AnchorProvider(
  new anchor.web3.Connection("https://api.devnet.solana.com"),
  new anchor.Wallet(payer),
  {}
);  // Set provider globally
  anchor.setProvider(provider);
  // Then initialize program
  const program = anchor.workspace.Mawari as Program<Mawari>;

  let mint = new anchor.web3.PublicKey("3DmFRhgVPQH9SZEiF4rL4KTDYrBjVXDGCZU33PmWFQHx"); // Use your token
  // const wallet = provider.wallet;



  // const receiver = anchor.web3.Keypair.generate();
  // let payerTokenAccount: anchor.web3.PublicKey;
  // let receiverTokenAccount: anchor.web3.PublicKey;

  async function createPDA(seeds: Buffer[], programId: anchor.web3.PublicKey): Promise<[anchor.web3.PublicKey, number]> {
    let [PDA, bump] = await anchor.web3.PublicKey.findProgramAddressSync(
      seeds,
      programId
    );
    return [PDA, bump];
  }

  const fundATA = async (provider: anchor.AnchorProvider, mint: anchor.web3.PublicKey, user: anchor.web3.Keypair, userATA: anchor.web3.PublicKey, decimals: number): Promise<anchor.web3.PublicKey> => {
    // Create TX to mint tokens to the User
    const txFundATA = new anchor.web3.Transaction();

    txFundATA.add(
      createAssociatedTokenAccountInstruction(
        user.publicKey,
        userATA,
        user.publicKey,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );

    txFundATA.add(
      createMintToInstruction(
        mint,
        userATA,
        provider.wallet.publicKey,
        2000 * 10 ** decimals,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const txFundToken = await provider.sendAndConfirm(txFundATA, [user]);
    return userATA;
  }

  let mawari, dataBump;
  let vaultTokenAccount: anchor.web3.PublicKey;

  before(async () => {
    [mawari, dataBump] = await createPDA([Buffer.from("mawari_state")], program.programId);
  
    console.log("mawari", mawari.toString());
  
    // Use existing token mint
    mint = new anchor.web3.PublicKey("3DmFRhgVPQH9SZEiF4rL4KTDYrBjVXDGCZU33PmWFQHx");
  
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );
  
    console.log("Token Account Address:", tokenAccount.address.toBase58());

    // Create vault token account
    const vaultATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      mawari,
      true
    );
    vaultTokenAccount = vaultATA.address;
    console.log("Vault Token Account:", vaultTokenAccount.toString());
  });
  

  it("Can initialize payment", async () => {
    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          state: mawari,
          mawariTokenMint: mint,
          authority: payer.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
  
      console.log("Transaction signature:", tx);
    } catch (err) {
      console.error("Error during initialization:", err.message);
      // Handle already initialized case
    }
  });
  

  it("Can whitelist user", async () => {

    const userToWhitelist = anchor.web3.Keypair.generate();

    // Fund user with sol for rent
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: userToWhitelist.publicKey,
          lamports: LAMPORTS_PER_SOL / 10
        })
      )
    )

    // Derive the user account PDA
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user"),
        userToWhitelist.publicKey.toBuffer()
      ],
      program.programId
    );

    try {
      const tx = await program.methods.whitelistUser().accounts({
        state: mawari,
        authority: payer.publicKey,
        userAccount: userAccount,
        user: userToWhitelist.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,

      }).signers([payer]).rpc()

      await provider.connection.confirmTransaction(tx);
      console.log("Whitelist transaction signature:", tx);

      // Wait a bit for account to be available
      await new Promise(resolve => setTimeout(resolve, 1000));

      // fetch the user account data
      const userAccountData = await program.account.userAccount.fetch(userAccount);
      console.log("User account data:", {
        isWhitelisted: userAccountData.isWhitelisted,
        owner: userAccountData.owner.toString()
      });
  
      // Assert the whitelist status
      assert.isTrue(userAccountData.isWhitelisted, "User should be whitelisted");
      assert.isTrue(
        userAccountData.owner.equals(userToWhitelist.publicKey),
        "Owner should match user public key"
      );


    } catch(error) {
      console.error("whitelist error:", error)
      throw error

    }

    

  });

  it("Can Remove user", async () => {

    const userToWhitelist = anchor.web3.Keypair.generate();

    // Derive the user account PDA
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user"),
        userToWhitelist.publicKey.toBuffer()
      ],
      program.programId
    );

    const tx = await program.methods
      .whitelistUser()
      .accounts({
        state: mawari,
        authority: payer.publicKey,  // The admin/authority who can whitelist
        userAccount: userAccount,    // PDA to store user data
        user: userToWhitelist.publicKey,  // The user being whitelisted
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer])  // Authority needs to sign
      .rpc();
    
    console.log("Transaction signature:", tx);


    // Fetch the user account data
    const userAccountData = await program.account.userAccount.fetch(userAccount);

    // Assert that the user is whitelisted
    if (userAccountData.isWhitelisted) {
      console.log("User is whitelisted");
    } else {
      console.log("User is not whitelisted");
    }

    const tx1 = await program.methods
      .removeUser()
      .accounts({
        state: mawari,
        authority: payer.publicKey,  // The admin/authority who can remove
        userAccount: userAccount,    // PDA to store user data
        user: userToWhitelist.publicKey,  // The user being removed
      })
      .signers([payer])  // Authority needs to sign
      .rpc();

    // Fetch the user account data after removal
    const userAccountDataAfterRemoval = await program.account.userAccount.fetch(userAccount);

    // Assert that the user is not whitelisted after removal
    if (!userAccountDataAfterRemoval.isWhitelisted) {
      console.log("User is not whitelisted after removal");
    } else {
      console.log("User is still whitelisted after removal");
    }

  });
  it("Can deposit tokens", async () => {
    const user = anchor.web3.Keypair.generate();
    const [userAccount] = await createPDA(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      program.programId
    );

    // Whitelist user first
    await program.methods
      .whitelistUser()
      .accounts({
        state: mawari,
        authority: payer.publicKey,
        userAccount,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Setup token accounts
    const userATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      user.publicKey
    );

    const payerATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );

    // Transfer tokens to user
    await transfer(
      provider.connection,
      payer,
      payerATA.address,
      userATA.address,
      payer.publicKey,
      1000000
    );

    const vaultATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      mawari,
      true
    );

    // Now deposit
    const depositAmount = new anchor.BN(500000);
    const tx = await program.methods
      .deposit(depositAmount)
      .accounts({
        state: mawari,
        userAccount,
        user: user.publicKey,
        userTokenAccount: userATA.address,
        vaultTokenAccount: vaultATA.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("Deposit tx:", tx);
  });


  it("Can withdraw tokens", async () => {
    // Create new user
    const user = anchor.web3.Keypair.generate();
    
    // Fund user with SOL for rent
    const fundTx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: user.publicKey,
        lamports: LAMPORTS_PER_SOL / 10
      })
    );
    await provider.sendAndConfirm(fundTx);
    
    // Create user PDA
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      program.programId
    );

    // Whitelist user
    await program.methods
      .whitelistUser()
      .accounts({
        state: mawari,
        authority: payer.publicKey,
        userAccount: userAccount,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    // Setup token accounts
    const userATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      user.publicKey
    );

    const payerATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );

    // Transfer tokens to user
    await transfer(
      provider.connection,
      payer,
      payerATA.address,
      userATA.address,
      payer,
      1_000_000 // Amount to transfer
    );

    // Deposit tokens
    const depositAmount = new anchor.BN(500_000);
    await program.methods
      .deposit(depositAmount)
      .accounts({
        state: mawari,
        userAccount: userAccount,
        user: user.publicKey,
        userTokenAccount: userATA.address,
        vaultTokenAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    // Get state for withdraw ID
    const state = await program.account.mawariState.fetch(mawari);
    const withdrawId = state.expectedWithdrawId;

    // Withdraw tokens
    const withdrawAmount = new anchor.BN(200_000);
    const tx = await program.methods
      .withdraw(withdrawId, withdrawAmount)
      .accounts({
        state: mawari,
        userAccount: userAccount,
        user: user.publicKey,
        userTokenAccount: userATA.address,
        vaultTokenAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        authority: payer.publicKey,
      })
      .signers([payer])
      .rpc();

    console.log("Withdraw transaction:", tx);
  });

  it("Can validate payment", async () => {
    // Create new user
    const user = anchor.web3.Keypair.generate();
    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: user.publicKey,
          lamports: LAMPORTS_PER_SOL / 10
        })
      )
    );

    // Create user PDA
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      program.programId
    );

    // Whitelist user
    await program.methods
      .whitelistUser()
      .accounts({
        state: mawari,
        authority: payer.publicKey,
        userAccount: userAccount,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    // Setup token accounts
    const userATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      user.publicKey
    );

    const payerATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey
    );

    // Transfer tokens to user
    await transfer(
      provider.connection,
      payer,
      payerATA.address,
      userATA.address,
      payer,
      1_000_000
    );

    // Deposit
    const depositAmount = new anchor.BN(500_000);
    await program.methods
      .deposit(depositAmount)
      .accounts({
        state: mawari,
        userAccount: userAccount,
        user: user.publicKey,
        userTokenAccount: userATA.address,
        vaultTokenAccount: vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    // Get state for validate ID
    const state = await program.account.mawariState.fetch(mawari);
    const validateId = state.expectedValidateId;

    // Validate payment
    const validateAmount = new anchor.BN(200_000);
    const tx = await program.methods
      .validate(validateId, validateAmount)
      .accounts({
        state: mawari,
        fromAccount: userAccount,
        toAccount: userAccount,
        from: user.publicKey,
        to: user.publicKey,
        authority: payer.publicKey
      })
      .signers([payer])
      .rpc();

    console.log("Validate transaction:", tx);
  });

});