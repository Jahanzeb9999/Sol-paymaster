use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::mawari_state::*;
use crate::error::MawariError;
use crate::events::DepositAdded;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump = user_account.bump,
        constraint = user_account.is_whitelisted @ MawariError::NotWhitelisted,
    )]
    pub user_account: Account<'info, UserAccount>,

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
        seeds = [b"mawari_state"],
        bump = state.bump
    )]
    pub state: Account<'info, MawariState>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let user_account = &mut ctx.accounts.user_account;

    require!(amount > 0, MawariError::InvalidAmount);

     // Update state first
     let state = &mut ctx.accounts.state;
     state.total_locked_tokens = state.total_locked_tokens
         .checked_add(amount)
         .ok_or(MawariError::Overflow)?;
 
     // Update user balance before transfer
     user_account.balance = user_account.balance
         .checked_add(amount)
         .ok_or(MawariError::Overflow)?;
     
     // Update timestamps
     user_account.last_deposit = Clock::get()?.unix_timestamp;
     user_account.total_deposits = user_account.total_deposits
         .checked_add(1)
         .ok_or(MawariError::Overflow)?;
 

    // Transfer tokens from user to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;


    // Emit deposit event
    emit!(DepositAdded {
        user: ctx.accounts.user.key(),
        amount,
    });

    Ok(())
}