using System;

internal static class JobLinkTests
{
    private static int Main()
    {
        AssertAccepted("prowest-job://open/9170", "9170");
        AssertAccepted("PROWEST-JOB://OPEN/12345", "12345");

        AssertRejected("prowest-job://open/0");
        AssertRejected("prowest-job://open/09170");
        AssertRejected("prowest-job://open/2147483648");
        AssertRejected("prowest-job://open/9170/../9171");
        AssertRejected("prowest-job://open/9170?path=other");
        AssertRejected("prowest-job://open/9170#other");
        AssertRejected("prowest-job://open/9170%5cother");
        AssertRejected("prowest-job://other/9170");
        AssertRejected(" prowest-job://open/9170");
        AssertRejected("prowest-job://open/9170 ");

        Console.WriteLine("Job link validation passed.");
        return 0;
    }

    private static void AssertAccepted(string link, string expected)
    {
        string actual;
        if (!JobLink.TryGetJobNumber(link, out actual) || actual != expected)
        {
            throw new Exception("Expected a valid job link: " + link);
        }
    }

    private static void AssertRejected(string link)
    {
        string actual;
        if (JobLink.TryGetJobNumber(link, out actual))
        {
            throw new Exception("Expected an invalid job link: " + link);
        }
    }
}
