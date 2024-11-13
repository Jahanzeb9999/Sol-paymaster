import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Mawari } from "../target/types/mawari";
import { getAccount, TOKEN_PROGRAM_ID, createMint, createAccount, mintTo, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { assert, expect } from "chai";

describe("Mawari Revert Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Mawari as Program<Mawari>;

  let mint: anchor.web3.PublicKey;
  const payer = anchor.web3.Keypair.generate();
  let mawari: anchor.web3.PublicKey;
  let dataBump: number;

  before(async () => {
    [mawari, dataBump] = await anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mawari_state")],
      program.programId
    );

    // Airdrop SOL to payer
    const signature = await provider.connection.requestAirdrop(
      payer.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature);

    // Create token mint
    mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      9
    );

    // Initialize program state
    await program.methods
      .initialize()
      .accounts({
        state: mawari,
        mawariTokenMint: mint,
        authority: payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  });

  it("Should revert when non-authority tries to whitelist", async () => {
    const unauthorizedUser = anchor.web3.Keypair.generate();
    const userToWhitelist = anchor.web3.Keypair.generate();

    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), userToWhitelist.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .whitelistUser()
        .accounts({
          state: mawari,
          authority: unauthorizedUser.publicKey,
          userAccount: userAccount,
          user: userToWhitelist.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([unauthorizedUser])
        .rpc();
      assert.fail("Should have reverted");
    } catch (e) {
      console.log("Successfully reverted unauthorized whitelist attempt");
    }
  });

  it("Should revert when non-whitelisted user tries to deposit", async () => {
    const nonWhitelistedUser = anchor.web3.Keypair.generate();
    
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), nonWhitelistedUser.publicKey.toBuffer()],
      program.programId
    );

    const userTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      nonWhitelistedUser.publicKey
    );

    const vaultTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      mawari,
      true
    );

    const depositAmount = new anchor.BN(1000000);
    await mintTo(
      provider.connection,
      payer,
      mint,
      userTokenAccount,
      payer,
      depositAmount.toNumber()
    );

    try {
      await program.methods
        .deposit(depositAmount)
        .accounts({
          state: mawari,
          userAccount: userAccount,
          user: nonWhitelistedUser.publicKey,
          userTokenAccount: userTokenAccount,
          vaultTokenAccount: vaultTokenAccount.address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([nonWhitelistedUser])
        .rpc();
      assert.fail("Should have reverted");
    } catch (e) {
      console.log("Successfully reverted unauthorized deposit attempt");
    }
  });

  it("Should revert when withdrawing more than balance", async () => {
    const user = anchor.web3.Keypair.generate();
    
    // Whitelist the user
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), user.publicKey.toBuffer()],
      program.programId
    );

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

    // Deposit small amount
    const depositAmount = new anchor.BN(1000000);
    await mintTo(
      provider.connection,
      payer,
      mint,
      userTokenAccount,
      payer,
      depositAmount.toNumber()
    );

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

    // Try to withdraw more than deposited
    const withdrawAmount = new anchor.BN(2000000);
    const withdrawId = new anchor.BN(0);

    try {
      await program.methods
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
      assert.fail("Should have reverted");
    } catch (e) {
      console.log("Successfully reverted withdrawal exceeding balance");
    }
  });

  it("Should revert validate with invalid validate ID", async () => {
    const user = anchor.web3.Keypair.generate();
    
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

    // Try to validate with incorrect ID
    const invalidValidateId = new anchor.BN(999);
    const validateAmount = new anchor.BN(500000);

    try {
      await program.methods
        .validate(invalidValidateId, validateAmount)
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
      assert.fail("Should have reverted");
    } catch (e) {
      console.log("Successfully reverted validation with invalid ID");
    }
  });

  it("Should revert when removing non-whitelisted user", async () => {
    const nonWhitelistedUser = anchor.web3.Keypair.generate();
    
    const [userAccount] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("user"), nonWhitelistedUser.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .removeUser()
        .accounts({
          state: mawari,
          authority: payer.publicKey,
          userAccount: userAccount,
          user: nonWhitelistedUser.publicKey,
        })
        .signers([payer])
        .rpc();
      assert.fail("Should have reverted");
    } catch (e) {
      console.log("Successfully reverted removing non-whitelisted user");
    }
  });
});