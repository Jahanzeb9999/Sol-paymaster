use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::mawari_state::*;
use crate::error::MawariError;
use crate::events::Withdrawn;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        constraint = authority.key() == state.authority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump = user_account.bump,
        constraint = user_account.is_whitelisted @ MawariError::NotWhitelisted,
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: Account that will receive the withdrawal
    pub user: AccountInfo<'info>,

    #[account(
        mut,
        constraint = user_token_account.mint == state.mawari_token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault_token_account.mint == state.mawari_token_mint
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"mawari_state"],
        bump = state.bump
    )]
    pub state: Account<'info, MawariState>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Withdraw>, withdraw_id: u64, amount: u64) -> Result<()> {
    // Verify withdraw ID
    require!(
        withdraw_id == ctx.accounts.state.expected_withdraw_id,
        MawariError::InvalidWithdrawId
    );

    // Verify user has enough balance
    require!(
        ctx.accounts.user_account.balance >= amount,
        MawariError::InsufficientBalance
    );

    // Update user balance
    ctx.accounts.user_account.balance = ctx.accounts.user_account.balance
        .checked_sub(amount)
        .ok_or(error!(MawariError::InsufficientBalance))?;

    // Transfer tokens from vault to user
    let state_bump = ctx.accounts.state.bump;
    let seeds = &[b"mawari_state".as_ref(), &[state_bump]];
    let signer = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.state.to_account_info(),
        },
        signer,
    );
    token::transfer(transfer_ctx, amount)?;

    // Increment expected withdraw ID
    ctx.accounts.state.expected_withdraw_id = ctx.accounts.state.expected_withdraw_id
        .checked_add(1)
        .unwrap();

    // Emit withdraw event
    emit!(Withdrawn {
        withdraw_id,
        user: ctx.accounts.user.key(),
        amount,
    });

    Ok(())
}