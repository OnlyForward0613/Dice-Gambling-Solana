use anchor_lang::prelude::*;
use std::clone::Clone;

use crate::constants::*;

#[account]
#[derive(Default)]
pub struct GlobalPool {
    pub admin: Pubkey,                      // 32
    pub token_address: [Pubkey; MAX_TOKEN], // 32*20
    pub token_count: u64,                   // 8
}

#[account(zero_copy)]
pub struct UserPool {
    pub user_address: Pubkey,               // 32
    pub token_address: [Pubkey; MAX_TOKEN], // 32*20
    pub token_amount: [u64; MAX_TOKEN],     // 8*20
    pub sol_amount: u64,                    // 8
}


impl Default for UserPool {
    #[inline]
    fn default() -> UserPool {
        UserPool {
            user_address: Pubkey::default(),
            token_address: [Pubkey::default(); MAX_TOKEN],
            token_amount: [0; MAX_TOKEN],
            sol_amount: 0,
        }
    }
}
