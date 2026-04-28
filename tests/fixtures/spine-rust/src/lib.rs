pub mod config;
pub mod routes;
pub mod services;

pub fn run() -> &'static str {
    services::user_service::get_user_service()
}

