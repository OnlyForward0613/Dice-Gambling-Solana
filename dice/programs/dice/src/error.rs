use anchor_lang::prelude::*;

#[error_code]
pub enum DiceError {
    #[msg("This Token is not Registered Token")]
    NotRegisteredToken,
    #[msg("The Amount Exceed")]
    ExceedAmount,
    #[msg("There is more than One Pending Milestone")]
    PendingMilestone,
    #[msg("This Account Cannot Access This Function")]
    CannotAccess,
    #[msg("This Account isn't Project Rep")]
    NotProjectRep,
    #[msg("This Project is Already Accepted by Someone")]
    AlreadyAccepted
    
}
