use anchor_lang::{prelude::*, AccountSerialize, AnchorDeserialize};
use solana_program::pubkey::Pubkey;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

pub mod account;
pub mod constants;
pub mod error;
pub mod utils;

use account::*;
use constants::*;
use error::*;
use utils::*;

declare_id!("77WPfiSfVcYHZQKNUZH6wbB6v1dXieX4upy2UuTMGSj2");

#[program]
pub mod freelancer {
    use super::*;
   
    pub fn initialize(
        ctx: Context<Initialize>
    ) -> Result<()> {
        let global_authority = &mut ctx.accounts.global_authority;
        global_authority.token_count = 0;
        // Escrow funds to the PDA
        sol_transfer_user(
            ctx.accounts.admin.to_account_info(),
            ctx.accounts.game_vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            INIT_DEPOSIT_AMOUNT,
        )?;
        Ok(())
    }

    pub fn init_sol_pool(
        ctx: Context<InitSolPool>,
        deposit_amount: u64
    ) -> Result<()> {
        // Escrow funds to the PDA
        sol_transfer_user(
            ctx.accounts.admin.to_account_info(),
            ctx.accounts.game_vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            deposit_amount,
        )?;
        Ok(())
    }

    pub fn init_token_pool(
        ctx: Context<InitTokenPool>,
        token_amount: u64
    ) -> Result<()> {
        let global_authority = &mut ctx.accounts.global_authority;
        
        let mut valid = 0;

        for i in 0..global_authority.token_count {
            if global_authority.token_address[i as usize] == ctx.accounts.token_mint.key() {
                valid = 1;
                break;
            }
        }

        let count = global_authority.token_count;
        if valid == 0 {
            global_authority.token_address[count as usize] = ctx.accounts.token_mint.key();
            global_authority.token_count += 1;
        }

        let token_account_info = &mut &ctx.accounts.admin_token_account;
        let dest_token_account_info = &mut &ctx.accounts.vault_token_account;
        let token_program = &mut &ctx.accounts.token_program;

        let cpi_accounts = Transfer {
            from: token_account_info.to_account_info().clone(),
            to: dest_token_account_info.to_account_info().clone(),
            authority: ctx.accounts.admin.to_account_info().clone(),
        };
        token::transfer(
            CpiContext::new(token_program.clone().to_account_info(), cpi_accounts),
            token_amount,
        )?;

        Ok(())
    }
    

    pub fn init_user_pool(
        ctx: Context<InitUserPool>
    ) -> Result<()> {
        let mut user_pool = ctx.accounts.user_pool.load_init()?;
        sol_transfer_user(
            ctx.accounts.user.to_account_info(),
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            INIT_DEPOSIT_AMOUNT,
        )?;
        user_pool.user_address = ctx.accounts.user.key();
        user_pool.sol_amount +=INIT_DEPOSIT_AMOUNT;
        Ok(())
    }

    pub fn deposit_user_sol(
        ctx: Context<DepositUserSol>,
        ex_amount: u64,
        deposit_amount: u64
    ) -> Result<()> {
        let mut user_pool = ctx.accounts.user_pool.load_mut()?;
        user_pool.sol_amount = ex_amount + deposit_amount;

        sol_transfer_user(
            ctx.accounts.user.to_account_info(),
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            deposit_amount,
        )?;

        Ok(())
    }

    pub fn desposit_user_token(
        ctx: Context<DepositUserToken>,
        ex_amount: u64,
        deposit_amount: u64
    ) -> Result<()> {
        let mut user_pool = ctx.accounts.user_pool.load_mut()?;
        let global_authority = &mut ctx.accounts.global_authority;
        let mut valid = 0;
        for i in 0..global_authority.token_count {
            if global_authority.token_address[i as usize] == ctx.accounts.token_mint.key() {
                valid = i+1;
                break;
            }
        }
        require!(valid != 0, DiceError::NotRegisteredToken);

        let token_account_info = &mut &ctx.accounts.user_token_account;
        let dest_token_account_info = &mut &ctx.accounts.vault_token_account;
        let token_program = &mut &ctx.accounts.token_program;

        let cpi_accounts = Transfer {
            from: token_account_info.to_account_info().clone(),
            to: dest_token_account_info.to_account_info().clone(),
            authority: ctx.accounts.user.to_account_info().clone(),
        };
        token::transfer(
            CpiContext::new(token_program.clone().to_account_info(), cpi_accounts),
            deposit_amount,
        )?;

        user_pool.token_address[(valid - 1) as usize] = ctx.accounts.token_mint.key();
        user_pool.token_amount[(valid-1) as usize] = ex_amount+deposit_amount;

        Ok(())
    }
    
    pub fn withdraw_user_sol(
        ctx: Context<WithdrawUserSol>,
        ex_amount: u64,
        withdraw_amount: u64,
        bump: u8
    ) -> Result<()> {
        require!(ex_amount>withdraw_amount, DiceError::ExceedAmount);

        let mut user_pool = ctx.accounts.user_pool.load_mut()?;
        user_pool.sol_amount = ex_amount - withdraw_amount;

        sol_transfer_with_signer(
            ctx.accounts.escrow_vault.to_account_info(),
            ctx.accounts.user.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            &[&[ctx.accounts.user.key.as_ref(), ESCROW_VAULT.as_bytes(), &[bump]]],
            withdraw_amount,
        )?;
        Ok(())
    }

    pub fn withdraw_user_token(
        ctx: Context<WithdrawUserToken>,
        ex_amount: u64,
        withdraw_amount: u64,
        bump: u8,
    ) -> Result<()> {
        let mut user_pool = ctx.accounts.user_pool.load_mut()?;
        let global_authority = &mut ctx.accounts.global_authority;
        require!(ex_amount>withdraw_amount, DiceError::ExceedAmount);

        let mut valid = 0;
        for i in 0..global_authority.token_count {
            if global_authority.token_address[i as usize] == ctx.accounts.token_mint.key() {
                valid = i+1;
                break;
            }
        }
        require!(valid != 0, DiceError::NotRegisteredToken);

        let token_account_info = &mut &ctx.accounts.user_token_account;
        let dest_token_account_info = &mut &ctx.accounts.vault_token_account;
        let token_program = &mut &ctx.accounts.token_program;
        let seeds = &[ctx.accounts.user.key.as_ref(), ESCROW_VAULT.as_bytes(), &[bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: dest_token_account_info.to_account_info().clone(),
            to: token_account_info.to_account_info().clone(),
            authority: ctx.accounts.global_authority.to_account_info()
        };
        token::transfer(
            CpiContext::new_with_signer(token_program.to_account_info().clone(), cpi_accounts, signer),
            withdraw_amount
        )?;

        user_pool.token_address[(valid - 1) as usize] = ctx.accounts.token_mint.key();
        user_pool.token_amount[(valid-1) as usize] = ex_amount-withdraw_amount;

        Ok(())
    }
    
}


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        mut,
        seeds = [GAME_VAULT.as_ref()],
        bump,
    )]
    pub game_vault: AccountInfo<'info>,

    #[account(
        init_if_needed,
        seeds = [GLOBAL_AUTHORITY.as_ref()],
        bump,
        payer = admin,
        space = 688
    )]
    pub global_authority: Account<'info, GlobalPool>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitSolPool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        mut,
        seeds = [GAME_VAULT.as_ref()],
        bump,
    )]
    pub game_vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitTokenPool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        mut,
        seeds = [GAME_VAULT.as_ref()],
        bump,
    )]
    pub game_vault: AccountInfo<'info>,

    #[account(
        mut,
        constraint = admin_token_account.mint == *token_mint.key,
        constraint = admin_token_account.owner == *admin.key,
    )]
    pub admin_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = vault_token_account.mint == *token_mint.key,
        constraint = vault_token_account.owner == *game_vault.key,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY.as_ref()],
        bump
    )]
    pub global_authority: Box<Account<'info, GlobalPool>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_mint: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct InitUserPool<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        mut,
        seeds = [user.key().to_bytes().as_ref(), ESCROW_VAULT.as_ref()],
        bump,
    )]
    pub escrow_vault: AccountInfo<'info>,
    
    #[account(zero)]
    pub user_pool: AccountLoader<'info, UserPool>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_mint: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositUserSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        mut,
        seeds = [user.key().to_bytes().as_ref(), ESCROW_VAULT.as_ref()],
        bump,
    )]
    pub escrow_vault: AccountInfo<'info>,
    
    #[account(mut)]
    pub user_pool: AccountLoader<'info, UserPool>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositUserToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        mut,
        seeds = [user.key().to_bytes().as_ref(), ESCROW_VAULT.as_ref()],
        bump,
    )]
    pub escrow_vault: AccountInfo<'info>,

    #[account(mut)]
    pub user_pool: AccountLoader<'info, UserPool>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY.as_ref()],
        bump
    )]
    pub global_authority: Box<Account<'info, GlobalPool>>,

    #[account(
        mut,
        constraint = user_token_account.mint == *token_mint.key,
        constraint = user_token_account.owner == *user.key,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = vault_token_account.mint == *token_mint.key,
        constraint = vault_token_account.owner == *escrow_vault.key,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_mint: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct WithdrawUserSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        mut,
        seeds = [user.key().to_bytes().as_ref(), ESCROW_VAULT.as_ref()],
        bump,
    )]
    pub escrow_vault: AccountInfo<'info>,
    
    #[account(mut)]
    pub user_pool: AccountLoader<'info, UserPool>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawUserToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(
        mut,
        seeds = [user.key().to_bytes().as_ref(), ESCROW_VAULT.as_ref()],
        bump,
    )]
    pub escrow_vault: AccountInfo<'info>,

    #[account(mut)]
    pub user_pool: AccountLoader<'info, UserPool>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY.as_ref()],
        bump
    )]
    pub global_authority: Box<Account<'info, GlobalPool>>,

    #[account(
        mut,
        constraint = user_token_account.mint == *token_mint.key,
        constraint = user_token_account.owner == *user.key,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = vault_token_account.mint == *token_mint.key,
        constraint = vault_token_account.owner == *escrow_vault.key,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    pub token_mint: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}