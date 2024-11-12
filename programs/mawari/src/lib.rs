use anchor_lang::prelude::*;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("4fdmVM3iqcGLFCvyrtJ1WGhfjdyRMnAxo5h8DpdErRaY");

use instructions::deposit::*;
use instructions::validate::*;
use instructions::whitelist::*;
use instructions::withdraw::*;
pub use state::mawari_state::*;

#[program]
pub mod mawari {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, withdraw_id: u64, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, withdraw_id, amount)
    }

    pub fn validate(
        ctx: Context<Validate>,
        validate_id: u64,
        amount: u64,
    ) -> Result<()> {
        instructions::validate::handler(ctx, validate_id, amount)
    }

    pub fn whitelist_user(ctx: Context<WhitelistUser>) -> Result<()> {
        instructions::whitelist::add_user_handler(ctx)
    }

    pub fn remove_user(ctx: Context<RemoveUser>) -> Result<()> {
        instructions::whitelist::remove_user_handler(ctx)
    }
}