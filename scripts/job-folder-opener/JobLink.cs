using System;
using System.Globalization;

internal static class JobLink
{
    private const string Prefix = "prowest-job://open/";

    internal static bool TryGetJobNumber(string link, out string jobNumber)
    {
        jobNumber = null;
        if (string.IsNullOrEmpty(link) ||
            link.Length <= Prefix.Length ||
            link.Length > Prefix.Length + 10 ||
            !link.StartsWith(Prefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        string candidate = link.Substring(Prefix.Length);
        if (candidate[0] == '0') return false;

        foreach (char character in candidate)
        {
            if (character < '0' || character > '9') return false;
        }

        int number;
        if (!int.TryParse(candidate, NumberStyles.None, CultureInfo.InvariantCulture, out number) || number < 1)
        {
            return false;
        }

        jobNumber = candidate;
        return true;
    }
}
