use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

use crate::state::MawariState;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub mawari_token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,space = 8 + MawariState::LEN,
        seeds = [b"mawari_state"],
        bump
    )]
    pub state: Account<'info, MawariState>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let state = &mut ctx.accounts.state;
    state.authority = ctx.accounts.authority.key();
    state.mawari_token_mint = ctx.accounts.mawari_token_mint.key();
    state.expected_withdraw_id = 0;
    state.expected_validate_id = 0;
    state.bump = ctx.bumps.state; // Access bump directly
    Ok(())
}
