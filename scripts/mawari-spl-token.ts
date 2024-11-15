import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  burn,
  AuthorityType,
  TOKEN_PROGRAM_ID,
  getMint,
} from "@solana/spl-token";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";


dotenv.config({ path: './.env' });

// Load wallet from environment variable
function loadWallet(): Keypair {
  const walletPath = process.env.ADMIN_WALLET_SECRET;
  if (!walletPath) {
    throw new Error("Please set ADMIN_WALLET_SECRET in .env file");
  }
  try {
    const secretKey = Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf-8")));
    return Keypair.fromSecretKey(secretKey, { skipValidation: false });
  } catch (error) {
    throw new Error(`Failed to load wallet at path ${walletPath}: ${error}`);
  }
}

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const wallet = loadWallet();
const metaplex = Metaplex.make(connection).use(keypairIdentity(wallet));

// Create Token and Metadata
async function createToken(): Promise<PublicKey> {
  const mintKeypair = Keypair.generate();

  // Create token with mint authority set to wallet.publicKey
  const mintPublicKey = await createMint(
    connection,
    wallet,
    wallet.publicKey,
    wallet.publicKey,
    9 // decimal places
  );

  // Create metadata using Metaplex (no URI, as specified)
  await metaplex.nfts().create({
    useNewMint: mintKeypair,
    updateAuthority: wallet,
    name: "Test Token",
    symbol: "TST",
    uri: "",
    sellerFeeBasisPoints: 0,
  });

  console.log("Token and metadata created with mint address:", mintPublicKey.toBase58());
  return mintPublicKey;
}

// Mint Tokens
async function mintTokens(mint: PublicKey, amount: number): Promise<void> {
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    mint,
    wallet.publicKey
  );

  await mintTo(
    connection,
    wallet,
    mint,
    tokenAccount.address,
    wallet.publicKey,
    amount * 10 ** 9
  );
  console.log(`${amount} tokens minted to ${tokenAccount.address.toBase58()}`);
}

// Burn Tokens
async function burnTokens(mint: PublicKey, amount: number): Promise<void> {
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    mint,
    wallet.publicKey
  );

  await burn(
    connection,
    wallet,
    tokenAccount.address,
    mint,
    wallet.publicKey,
    amount * 10 ** 9
  );
  console.log(`${amount} tokens burned from ${tokenAccount.address.toBase58()}`);
}

// Revoke Authorities (Freeze, Mint)
async function revokeAuthorities(mint: PublicKey): Promise<void> {
  // Revoke Mint Authority
  await setAuthority(
    connection,
    wallet,
    mint,
    wallet.publicKey,
    AuthorityType.MintTokens,
    null
  );
  console.log("Mint authority revoked.");

  // Revoke Freeze Authority
  await setAuthority(
    connection,
    wallet,
    mint,
    wallet.publicKey,
    AuthorityType.FreezeAccount,
    null
  );
  console.log("Freeze authority revoked.");
}

// Main execution
(async () => {
  const mint = await createToken();
  await mintTokens(mint, 1000); // Mint 1000 tokens
  await revokeAuthorities(mint); // Revoke all authorities
  await burnTokens(mint, 500); // Burn 500 tokens
})();
