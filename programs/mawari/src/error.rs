use anchor_lang::prelude::*;

#[error_code]
pub enum MawariError {
    #[msg("User is not whitelisted")]
    NotWhitelisted,
    #[msg("User is already whitelisted")]
    AlreadyWhitelisted,
    #[msg("Invalid withdraw ID")]
    InvalidWithdrawId,
    #[msg("Invalid validate ID")]
    InvalidValidateId,
    #[msg("Insufficient balance")]
    InsufficientBalance,
}