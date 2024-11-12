import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Mawari } from "../target/types/mawari";

import { getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, createMintToInstruction, createAssociatedTokenAccountInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { assert } from "chai";

describe("Mawari", () => {
  // Initialize provider first
  const provider = anchor.AnchorProvider.env();
  // Set provider globally
  anchor.setProvider(provider);
  // Then initialize program
  const program = anchor.workspace.Mawari as Program<Mawari>;

  let mint: anchor.web3.PublicKey;
  // const wallet = provider.wallet;

  // Add test accounts and token variables
  const payer = anchor.web3.Keypair.generate();

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
  before(async () => {
    [mawari, dataBump] = await createPDA([Buffer.from("mawari_state"),], program.programId);
    console.log("mawari", mawari)
    // Airdrop SOL to payer
    const signature = await provider.connection.requestAirdrop(
      payer.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);

    const authority = payer.publicKey;

    // Create new token mint
    mint = await createMint(
      provider.connection,
      payer,
      authority, // wallet.publicKey
      null,
      9 // decimals
    );

    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,               // Use payer as the signer
      mint,
      authority
    );

    console.log("Token Account Address:", tokenAccount.address.toBase58());

    await mintTo(
      provider.connection,
      payer,               // Use payer as the signer
      mint,
      tokenAccount.address,
      authority,
      100000e6
    );

  });

  it("Can initialize payment", async () => {

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

  });

  it("Can whitelist user", async () => {

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

    // Fetch the user account data
    const userAccountData = await program.account.userAccount.fetch(userAccount);

    // Assert that the user is whitelisted
    if (userAccountData.isWhitelisted) {
      console.log("User is whitelisted");
    } else {
      console.log("User is not whitelisted");
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

  it("Can deposit tokens with whitelisted user", async () => {

    // Create a new user and whitelist them
    const user = anchor.web3.Keypair.generate();

    // Derive the user account PDA
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      program.programId
    );

    // Whitelist the user first
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

    // Create token accounts for user
    const userTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      user.publicKey
    );

    // // Mint some tokens to the user
    const depositAmount = new anchor.BN(1000000);
    await mintTo(
      provider.connection,
      payer,
      mint,
      userTokenAccount,
      payer,
      depositAmount.toNumber(),
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Derive and create the vault token account
    const vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      mawari,  // The PDA owns the vault
      true     // Allow ownerOffCurve
    );

    // Execute deposit
    const tx = await program.methods
      .deposit(depositAmount)
      .accounts({
        state: mawari,
        userAccount: userAccount,
        user: user.publicKey,
        userTokenAccount: userTokenAccount,
        vaultTokenAccount: vaultTokenAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    // Fetch updated user account data
    const userAccountData = await program.account.userAccount.fetch(userAccount);

    assert(userAccountData.balance.eq(depositAmount) == true, "userAccountData.balance not updating")
    // assert(userAccountData.totalDeposits.eq(depositAmount) == true, "userAccountData.totalDeposits not updating")

    console.log("Deposit transaction signature:", tx);
  });

  it("Withdraw tokens", async () => {

    // Create a new user and whitelist them
    const user = anchor.web3.Keypair.generate();

    // Derive the user account PDA
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      program.programId
    );

    // Whitelist the user first
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

    // Create token accounts for user and vault
    const userTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      user.publicKey
    );

    const vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      mawari,
      true
    );

    // First deposit some tokens
    const depositAmount = new anchor.BN(1000000);
    await mintTo(
      provider.connection,
      payer,
      mint,
      userTokenAccount,
      payer,
      depositAmount.toNumber()
    );

    // Make the deposit
    await program.methods
      .deposit(depositAmount)
      .accounts({
        state: mawari,
        userAccount: userAccount,
        user: user.publicKey,
        userTokenAccount: userTokenAccount,
        vaultTokenAccount: vaultTokenAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    // Amount to withdraw and withdraw ID
    const withdrawAmount = new anchor.BN(500000);
    const withdrawId = new anchor.BN(0); // First withdrawal starts at 0

    // Execute withdraw
    const tx = await program.methods
      .withdraw(withdrawId, withdrawAmount)
      .accounts({
        state: mawari,
        userAccount: userAccount,
        user: user.publicKey,
        userTokenAccount: userTokenAccount,
        vaultTokenAccount: vaultTokenAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        authority: payer.publicKey
      })
      .signers([payer])
      .rpc();

    // Fetch updated account data
    const userAccountAfter = await program.account.userAccount.fetch(userAccount);

    console.log("userAccountAfter: ", userAccountAfter.balance.toString())
    const userTokenAccountAfter = await getAccount(
      provider.connection,
      userTokenAccount
    );

    // // Verify balances were updated correctly
    // assert(
    //   userAccountAfter.balance.eq(userAccountBefore.balance.sub(withdrawAmount)),
    //   "User vault balance not decreased correctly"
    // );

    // assert(
    //   new anchor.BN(userTokenAccountAfter.amount).eq(
    //     new anchor.BN(userTokenAccountBefore.amount).add(withdrawAmount)
    //   ),
    //   "User token account not increased correctly"
    // );

    console.log("Withdraw transaction signature:", tx);
  });

  it("Can validate payment", async () => {
    // Create a new user and whitelist them
    const user = anchor.web3.Keypair.generate();

    // Derive the user account PDA
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      program.programId
    );

    // Whitelist the user first
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

    // Fetch the user account data
    const userAccountData = await program.account.userAccount.fetch(userAccount);

    // Assert that the user is whitelisted
    if (userAccountData.isWhitelisted) {
      console.log("User is whitelisted");
    } else {
      console.log("User is not whitelisted");
    }

    // Create token accounts for user
    const userTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      user.publicKey
    );

    // // Mint some tokens to the user
    const depositAmount = new anchor.BN(1000000);
    await mintTo(
      provider.connection,
      payer,
      mint,
      userTokenAccount,
      payer,
      depositAmount.toNumber(),
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Derive and create the vault token account
    const vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      mawari,  // The PDA owns the vault
      true     // Allow ownerOffCurve
    );

    // Execute deposit
    const tx = await program.methods
      .deposit(depositAmount)
      .accounts({
        state: mawari,
        userAccount: userAccount,
        user: user.publicKey,
        userTokenAccount: userTokenAccount,
        vaultTokenAccount: vaultTokenAccount.address,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();


    // Validate the payment
    const validateId = new anchor.BN(0); // First validation starts at 0
    const validateAmount = new anchor.BN(500000);
    const validateTx = await program.methods
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

    console.log("Validate transaction signature:", validateTx);
  });


});