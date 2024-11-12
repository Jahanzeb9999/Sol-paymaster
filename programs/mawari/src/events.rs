use anchor_lang::prelude::*;

#[event]
pub struct UserAdded {
    pub user: Pubkey,
}

#[event]
pub struct UserRemoved {
    pub user: Pubkey,
}

#[event]
pub struct DepositAdded {
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Validated {
    pub validate_id: u64,
    pub user_from: Pubkey,
    pub user_to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawn {
    pub withdraw_id: u64,
    pub user: Pubkey,
    pub amount: u64,
}