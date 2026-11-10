using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Program
{
    private const string JobDrive = @"J:\";
    private const string MessageTitle = "Pro West Job Folder";

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();

        string jobNumber;
        if (args == null || args.Length != 1 || !JobLink.TryGetJobNumber(args[0], out jobNumber))
        {
            return ShowError("This job link is invalid. Open the job in Pro West Portal and try again.");
        }

        try
        {
            if ((File.GetAttributes(JobDrive) & FileAttributes.Directory) == 0)
            {
                return ShowDriveUnavailable();
            }
        }
        catch (UnauthorizedAccessException)
        {
            return ShowError("Your Windows account cannot access the job drive. Contact an administrator.");
        }
        catch (System.Security.SecurityException)
        {
            return ShowError("Your Windows account cannot access the job drive. Contact an administrator.");
        }
        catch (IOException)
        {
            return ShowDriveUnavailable();
        }
        catch (Exception)
        {
            return ShowDriveUnavailable();
        }

        string folder = Path.Combine(JobDrive, jobNumber);
        try
        {
            if ((File.GetAttributes(folder) & FileAttributes.Directory) == 0)
            {
                return ShowFolderMissing(jobNumber);
            }
        }
        catch (UnauthorizedAccessException)
        {
            return ShowError("Your Windows account cannot access this job folder. Contact an administrator.");
        }
        catch (System.Security.SecurityException)
        {
            return ShowError("Your Windows account cannot access this job folder. Contact an administrator.");
        }
        catch (FileNotFoundException)
        {
            return ShowFolderMissing(jobNumber);
        }
        catch (DirectoryNotFoundException)
        {
            return ShowFolderMissing(jobNumber);
        }
        catch (IOException)
        {
            return ShowError("The job folder could not be reached. Check the company network connection and try again.");
        }
        catch (Exception)
        {
            return ShowError("The job folder could not be reached. Check the company network connection and try again.");
        }

        try
        {
            string explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
            ProcessStartInfo startInfo = new ProcessStartInfo(explorer);
            startInfo.Arguments = "\"" + folder + "\"";
            startInfo.UseShellExecute = false;
            Process.Start(startInfo);
            return 0;
        }
        catch (Win32Exception)
        {
            return ShowError("Windows could not open File Explorer. Try opening the job folder from File Explorer directly.");
        }
        catch (InvalidOperationException)
        {
            return ShowError("Windows could not open File Explorer. Try opening the job folder from File Explorer directly.");
        }
        catch (Exception)
        {
            return ShowError("Windows could not open File Explorer. Try opening the job folder from File Explorer directly.");
        }
    }

    private static int ShowDriveUnavailable()
    {
        return ShowError("The job drive is unavailable. Connect to the company network and try again.");
    }

    private static int ShowFolderMissing(string jobNumber)
    {
        return ShowError("The folder for job #" + jobNumber + " was not found on the job drive. Contact an administrator.");
    }

    private static int ShowError(string message)
    {
        MessageBox.Show(message, MessageTitle, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return 1;
    }
}
