# Pro West Job Folder Opener

This small Windows program opens `J:\<job number>` in File Explorer when a browser follows a link such as `prowest-job://open/9170`. It does not create, edit, or delete job files. The Windows account running the browser must already have access to the mapped `J:` drive.

The program accepts only a positive numeric job number. It does not accept a path supplied by a website. It shows a Windows message if the link is invalid, the drive is unavailable, access is denied, or the numbered folder cannot be found.

## Build

In Windows PowerShell from this folder, run:

```powershell
.\build.ps1
```

The build uses the C# compiler included with Windows .NET Framework. It creates `dist\ProWestJobFolderOpener.exe` and runs the link-validation tests. The target computer needs .NET Framework 4.x. Copy the resulting executable alongside `install.ps1` to another Windows computer; that computer does not need to build it.

## Install on one pilot computer

Run `install.ps1` in a normal, non-administrator PowerShell window under the same Windows account that uses the portal. The script copies the executable to `%LOCALAPPDATA%\ProWest\JobFolderOpener` and registers the `prowest-job` link type for that account. It stops if another application already owns that link type.

```powershell
.\install.ps1
```

To test, open `test-link.html` in Chrome and click its link. Confirm the external-application prompt, then confirm File Explorer opens `J:\9170`. Use a different job number in the test page if that folder does not exist. Also test with the company network disconnected to check the unavailable-drive message. Browser prompts can vary by browser and profile.

To remove the helper for the current Windows account:

```powershell
.\uninstall.ps1
```

The Jobs modal shows **Open Job Folder** near the top for saved jobs on Windows. It is available in both the admin edit modal and the basic user's read-only job view. Save a new job first to receive its number and show the button. Each Windows account that uses the button needs this helper installed and access to the mapped `J:` drive.
