"""Synthetic CI-only ownership diagnostic; never prints account IDs or ACLs."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile

if os.name == 'nt':
    source = Path(__file__).resolve().parents[2] / 'scripts/backup/pull_snapshot.py'
    spec = importlib.util.spec_from_file_location('backup', source)
    backup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backup)
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder) / 'private'
        backup.private_dir(root)
        file = root / 'synthetic.txt'
        file.write_bytes(b'synthetic-no-secrets')
        script = r"""
        $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
        $acl=[IO.File]::GetAccessControl($env:FIXTURE_FILE)
        [Console]::WriteLine('owner_matches=' + ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid.Value))
        $others=$false
        foreach ($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
          if ($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -ne $sid.Value) {$others=$true}
        }
        [Console]::WriteLine('other_allow_grants=' + $others)
        """
        subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                       env=dict(os.environ, FIXTURE_FILE=str(file)), check=True)
        try:
            backup.private_file(file)
        except backup.BackupError as error:
            print(str(error))
