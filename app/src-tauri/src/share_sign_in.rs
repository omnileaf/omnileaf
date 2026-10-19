use omnileaf_engine::{ShareAddress, ShareSignIn, UnreachableShare};
use serde::Serialize;
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SignInOutcome {
    SignedIn,
    Cancelled,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(
    not(any(target_os = "linux", windows, test)),
    expect(
        dead_code,
        reason = "only Linux and Windows hand a share's sign-in over to the system so far"
    )
)]
pub(crate) enum SystemSignIn {
    Mounted,
    Cancelled,
    Failed,
}

pub(crate) async fn sign_in(
    share: Option<UnreachableShare>,
    ask_system: impl AsyncFnOnce(&ShareAddress) -> SystemSignIn,
    is_still_unreachable: impl AsyncFnOnce() -> bool,
) -> SignInOutcome {
    let Some(UnreachableShare { sign_in, .. }) = share else {
        return SignInOutcome::SignedIn;
    };
    let ShareSignIn::System(address) = sign_in else {
        return SignInOutcome::Failed;
    };
    match ask_system(&address).await {
        SystemSignIn::Cancelled => SignInOutcome::Cancelled,
        SystemSignIn::Failed => SignInOutcome::Failed,
        SystemSignIn::Mounted if is_still_unreachable().await => SignInOutcome::Failed,
        SystemSignIn::Mounted => SignInOutcome::SignedIn,
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_engine::NetworkShare;

    use super::*;

    fn unreachable(sign_in: ShareSignIn) -> UnreachableShare {
        UnreachableShare {
            share: NetworkShare {
                server: "nas".to_owned(),
                name: "nas/manga".to_owned(),
            },
            sign_in,
        }
    }

    fn signed_in_through_the_system() -> UnreachableShare {
        let address = ShareAddress::new("smb://nas.test/manga".to_owned());
        unreachable(ShareSignIn::System(address))
    }

    fn outcome(
        share: Option<UnreachableShare>,
        answer: SystemSignIn,
        is_still_unreachable: bool,
    ) -> SignInOutcome {
        tauri::async_runtime::block_on(sign_in(
            share,
            async |_| answer,
            async || is_still_unreachable,
        ))
    }

    #[test]
    fn is_signed_in_once_the_system_mounts_the_share_and_it_answers() {
        assert_eq!(
            outcome(
                Some(signed_in_through_the_system()),
                SystemSignIn::Mounted,
                false
            ),
            SignInOutcome::SignedIn
        );
    }

    #[test]
    fn fails_when_the_share_still_doesnt_answer_after_the_system_mounts_it() {
        assert_eq!(
            outcome(
                Some(signed_in_through_the_system()),
                SystemSignIn::Mounted,
                true
            ),
            SignInOutcome::Failed
        );
    }

    #[test]
    fn changes_nothing_when_the_sign_in_is_cancelled() {
        assert_eq!(
            outcome(
                Some(signed_in_through_the_system()),
                SystemSignIn::Cancelled,
                true
            ),
            SignInOutcome::Cancelled
        );
    }

    #[test]
    fn fails_when_the_system_couldnt_sign_in() {
        assert_eq!(
            outcome(
                Some(signed_in_through_the_system()),
                SystemSignIn::Failed,
                true
            ),
            SignInOutcome::Failed
        );
    }

    #[test]
    fn asks_the_system_for_the_address_of_the_share() {
        let mut asked = None;

        tauri::async_runtime::block_on(sign_in(
            Some(signed_in_through_the_system()),
            async |address| {
                asked = Some(address.as_str().to_owned());
                SystemSignIn::Cancelled
            },
            async || true,
        ));

        assert_eq!(asked.as_deref(), Some("smb://nas.test/manga"));
    }

    #[test]
    fn fails_without_asking_for_a_share_the_system_mounts_itself() {
        let asked = std::cell::Cell::new(false);

        let signed_in = tauri::async_runtime::block_on(sign_in(
            Some(unreachable(ShareSignIn::MountedBySystem)),
            async |_| {
                asked.set(true);
                SystemSignIn::Mounted
            },
            async || false,
        ));

        assert_eq!((signed_in, asked.get()), (SignInOutcome::Failed, false));
    }

    #[test]
    fn is_signed_in_without_asking_once_the_share_answers() {
        assert_eq!(
            outcome(None, SystemSignIn::Failed, true),
            SignInOutcome::SignedIn
        );
    }
}
