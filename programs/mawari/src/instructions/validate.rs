use anchor_lang::prelude::*;
use crate::state::mawari_state::*;
use crate::error::MawariError;
use crate::events::Validated;


#[derive(Accounts)]
pub struct Validate<'info> {
    #[account(
        constraint = authority.key() == state.authority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user", from.key().as_ref()],
        bump = from_account.bump,
        constraint = from_account.is_whitelisted @ MawariError::NotWhitelisted,
    )]
    pub from_account: Account<'info, UserAccount>,

    #[account(
        mut,
        seeds = [b"user", to.key().as_ref()],
        bump = to_account.bump,
        constraint = to_account.is_whitelisted @ MawariError::NotWhitelisted,
    )]
    pub to_account: Account<'info, UserAccount>,

    /// CHECK: From user account
    pub from: AccountInfo<'info>,
    
    /// CHECK: To user account
    pub to: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"mawari_state"],
        bump = state.bump
    )]
    pub state: Account<'info, MawariState>,
}

pub fn handler(ctx: Context<Validate>, validate_id: u64, amount: u64) -> Result<()> {
    // Verify validate ID
    require!(
        validate_id == ctx.accounts.state.expected_validate_id,
        MawariError::InvalidValidateId
    );

    // Verify from account has enough balance
    require!(
        ctx.accounts.from_account.balance >= amount,
        MawariError::InsufficientBalance
    );

    // Update balances
    ctx.accounts.from_account.balance = ctx.accounts.from_account.balance
        .checked_sub(amount)
        .ok_or(error!(MawariError::InsufficientBalance))?;

    ctx.accounts.to_account.balance = ctx.accounts.to_account.balance
        .checked_add(amount)
        .ok_or(error!(MawariError::InsufficientBalance))?;

    // Increment expected validate ID
    ctx.accounts.state.expected_validate_id = ctx.accounts.state.expected_validate_id
        .checked_add(1)
        .unwrap();

    // Emit validate event
    emit!(Validated {
        validate_id,
        user_from: ctx.accounts.from.key(),
        user_to: ctx.accounts.to.key(),
        amount,
    });

    Ok(())
}