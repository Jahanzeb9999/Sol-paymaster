use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct MawariState {
    /// The authority who can perform admin actions
    pub authority: Pubkey,
    
    /// The mint address of the Mawari token
    pub mawari_token_mint: Pubkey,
    
    /// The vault that holds all deposited tokens
    pub vault_token_account: Pubkey,
    
    /// The next expected withdraw ID
    pub expected_withdraw_id: u64,
    
    /// The next expected validate ID
    pub expected_validate_id: u64,
    
    /// Total number of whitelisted users
    pub total_users: u64,
    
    /// Total tokens locked in the vault
    pub total_locked_tokens: u64,
    
    /// Last update timestamp
    pub last_update: i64,
    
    /// Program state bump
    pub bump: u8,
    
}

#[account]
#[derive(Default)]
pub struct UserAccount {
    /// The owner of this account
    pub owner: Pubkey,
    
    /// Whether the user is whitelisted
    pub is_whitelisted: bool,
    
    /// User's token balance in the vault
    pub balance: u64,
    
    /// Last deposit timestamp
    pub last_deposit: i64,
    
    /// Last withdrawal timestamp
    pub last_withdrawal: i64,
    
    /// Total number of deposits made
    pub total_deposits: u64,
    
    /// Total number of withdrawals made
    pub total_withdrawals: u64,
    
    /// Account bump used in PDA derivation
    pub bump: u8,
    
    /// Reserved space for future upgrades
    pub reserved: [u8; 32],
}

impl MawariState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        32 + // mawari_token_mint
        32 + // vault_token_account
        8 + // expected_withdraw_id
        8 + // expected_validate_id
        8 + // total_users
        8 + // total_locked_tokens
        8 + // last_update
        1 + // bump
        64; // reserved
}

impl UserAccount {
    pub const LEN: usize = 8 + // discriminator
        32 + // owner
        1 + // is_whitelisted
        8 + // balance
        8 + // last_deposit
        8 + // last_withdrawal
        8 + // total_deposits
        8 + // total_withdrawals
        1 + // bump
        32; // reserved
}

/// Trait to update timestamps
pub trait Timestamp {
    fn update_timestamp(&mut self);
}

impl Timestamp for MawariState {
    fn update_timestamp(&mut self) {
        self.last_update = Clock::get().unwrap().unix_timestamp;
    }
}

impl Timestamp for UserAccount {
    fn update_timestamp(&mut self) {
        let now = Clock::get().unwrap().unix_timestamp;
        self.last_deposit = now;
        self.last_withdrawal = now;
    }
}