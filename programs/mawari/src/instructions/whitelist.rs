use anchor_lang::prelude::*;
use crate::state::mawari_state::*;
use crate::error::MawariError;
use crate::events::UserAdded;
use crate::events::UserRemoved;


#[derive(Accounts)]
pub struct WhitelistUser<'info> {
    #[account(
        mut, // Added mut since authority is the payer
        constraint = authority.key() == state.authority
    )]
    pub authority: Signer<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = UserAccount::LEN,
        seeds = [b"user", user.key().as_ref()],
        bump,
        constraint = !user_account.is_whitelisted || user_account.owner == user.key()
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: The user to be whitelisted
    pub user: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"mawari_state"],
        bump = state.bump
    )]
    pub state: Account<'info, MawariState>,

    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct RemoveUser<'info> {
    #[account(
        constraint = authority.key() == state.authority
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump = user_account.bump,
        constraint = user_account.is_whitelisted @ MawariError::NotWhitelisted,
        constraint = user_account.owner == user.key()
    )]
    pub user_account: Account<'info, UserAccount>,

    /// CHECK: The user to be removed
    pub user: AccountInfo<'info>,

    #[account(
        seeds = [b"mawari_state"],
        bump = state.bump
    )]
    pub state: Account<'info, MawariState>,
}


pub fn add_user_handler(ctx: Context<WhitelistUser>) -> Result<()> {
    let user_account = &mut ctx.accounts.user_account;
    
    // If account exists but not whitelisted, verify ownership
    if !user_account.is_whitelisted {
        require!(
            user_account.owner == Pubkey::default() || user_account.owner == ctx.accounts.user.key(),
            MawariError::AlreadyWhitelisted
        );
    }

    // Update account state
    user_account.owner = ctx.accounts.user.key();
    user_account.is_whitelisted = true;
    user_account.balance = 0;
    user_account.bump = ctx.bumps.user_account;;
    user_account.update_timestamp();

    // Update global state
    ctx.accounts.state.total_users = ctx.accounts.state.total_users.checked_add(1).unwrap();
    ctx.accounts.state.update_timestamp();

    emit!(UserAdded {
        user: ctx.accounts.user.key(),
    });

    Ok(())
}

pub fn remove_user_handler(ctx: Context<RemoveUser>) -> Result<()> {
    require!(
        ctx.accounts.user_account.balance == 0,
        MawariError::InsufficientBalance
    );

    let user_account = &mut ctx.accounts.user_account;
    user_account.is_whitelisted = false;
    user_account.update_timestamp();

    // Update global state
    ctx.accounts.state.total_users = ctx.accounts.state.total_users.checked_sub(1).unwrap();
    ctx.accounts.state.update_timestamp();

    emit!(UserRemoved {
        user: ctx.accounts.user.key(),
    });

    Ok(())
}