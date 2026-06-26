use std::path::Path;
use std::process::Command;

fn spawn(command: &mut Command) -> Result<(), String> {
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn open_folder(path: &Path) -> Result<(), String> {
    spawn(Command::new("open").arg(path))
}

pub fn open_terminal(path: &Path) -> Result<(), String> {
    spawn(Command::new("open").args(["-a", "Terminal"]).arg(path))
}
