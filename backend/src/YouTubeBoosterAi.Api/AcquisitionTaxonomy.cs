namespace YouTubeBoosterAi.Api;

/// <summary>
/// Configurable acquisition dimensions. Cooking is the default/primary cohort.
/// Add languages/categories here — do not redesign the CRM.
/// </summary>
public static class AcquisitionTaxonomy
{
    public const string DefaultCategory = "cooking";
    public const string DefaultCampaign = CreatorAcquisitionCampaigns.Cook001;
    public const string DefaultLanguage = "en";

    public static readonly (string Id, string Label, bool Active)[] Categories =
    [
        ("cooking", "Cooking & Food", true),
        ("technology", "Technology & AI", true),
        ("fitness", "Fitness & Sports", true),
        ("education", "Education", true),
        ("business", "Business / Entrepreneurship", true),
        ("entertainment", "Entertainment", true),
        ("gaming", "Gaming", true),
        ("travel", "Travel", true),
        ("lifestyle", "Lifestyle", true),
        ("health", "Health & Wellness", true),
        ("podcasts", "Podcasts / Interviews", true),
        ("diy", "DIY / Home", true),
        ("beauty", "Beauty / Fashion", true),
        ("automotive", "Automotive", true),
        ("finance", "Finance", true),
        ("other", "Other", true)
    ];

    public static readonly (string Id, string Label, string Phase)[] Languages =
    [
        ("en", "English", "active"),
        ("ru", "Russian", "active"),
        ("hi", "Hindi", "active"),
        ("es", "Spanish", "expansion"),
        ("pt", "Portuguese", "expansion"),
        ("uk", "Ukrainian", "observed"),
        ("ta", "Tamil", "future"),
        ("te", "Telugu", "future"),
        ("bn", "Bengali", "future"),
        ("mr", "Marathi", "future")
    ];

    public static readonly (string Id, string Label, bool Priority)[] Markets =
    [
        ("", "All / unspecified", false),
        ("IN", "India", true),
        ("US", "United States", false),
        ("GB", "United Kingdom", false),
        ("DE", "Germany", false),
        ("RU", "Russia", false),
        ("UA", "Ukraine", false),
        ("BR", "Brazil", false),
        ("MX", "Mexico", false),
        ("ES", "Spain", false),
        ("OTHER", "Other", false)
    ];

    public static string NormalizeCategory(string? raw)
    {
        var key = (raw ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(key)) return DefaultCategory;
        if (key is "food" or "cook" or "recipe" or "recipes") return "cooking";
        if (key is "tech" or "ai" or "technology & ai") return "technology";
        if (key is "sport" or "sports" or "fitness & sports") return "fitness";
        if (key is "home" or "diy / home") return "diy";
        if (key is "biz" or "entrepreneurship") return "business";
        return Categories.Any(c => c.Id == key) ? key : "other";
    }

    public static string NormalizeLanguage(string? raw)
    {
        var key = (raw ?? "").Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(key)) return DefaultLanguage;
        if (key.StartsWith("en")) return "en";
        if (key.StartsWith("ru")) return "ru";
        if (key.StartsWith("hi") || key is "hindi") return "hi";
        if (key.StartsWith("es") || key is "spanish") return "es";
        if (key.StartsWith("pt") || key is "portuguese") return "pt";
        if (key.StartsWith("uk")) return "uk";
        return key.Length <= 8 ? key : DefaultLanguage;
    }

    public static bool LanguageRequiresManualReview(string? language) =>
        NormalizeLanguage(language) is "hi" or "es" or "pt";

    public static string DeriveTier(long subscribers, bool strategic = false)
    {
        if (strategic) return "strategic";
        if (subscribers >= 1_000_000) return "major";
        if (subscribers >= 100_000) return "established";
        if (subscribers >= 10_000) return "growing";
        if (subscribers >= 1_000) return "emerging";
        return "unknown";
    }

    public static string GuessContentFormat(IEnumerable<string>? titles)
    {
        if (titles is null) return "unknown";
        var list = titles.Where(t => !string.IsNullOrWhiteSpace(t)).Take(20).ToList();
        if (list.Count == 0) return "unknown";
        var shorts = list.Count(t =>
            t.Contains("#short", StringComparison.OrdinalIgnoreCase)
            || t.Contains("shorts", StringComparison.OrdinalIgnoreCase));
        if (shorts == 0) return "long_form";
        if (shorts >= list.Count - 1) return "shorts";
        return "mixed";
    }

    public static string NormalizeMarket(string? raw)
    {
        var key = (raw ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(key)) return "";
        if (key is "INDIA" or "IND") return "IN";
        if (key is "USA" or "UNITED STATES") return "US";
        if (key is "UK" or "UNITED KINGDOM" or "GBR") return "GB";
        return key.Length <= 8 ? key : "OTHER";
    }

    public static bool IsChinaPriorityBlocked(string? market) =>
        string.Equals(NormalizeMarket(market), "CN", StringComparison.OrdinalIgnoreCase);

    public static object Catalog() => new
    {
        defaultCategory = DefaultCategory,
        defaultCampaign = DefaultCampaign,
        defaultLanguage = DefaultLanguage,
        cookingPrimary = true,
        chinaAcquisition = false,
        categories = Categories.Select(c => new { id = c.Id, label = c.Label, active = c.Active }),
        languages = Languages.Select(l => new { id = l.Id, label = l.Label, phase = l.Phase }),
        markets = Markets.Select(m => new { id = m.Id, label = m.Label, priority = m.Priority }),
        tiers = new[]
        {
            new { id = "emerging", label = "Emerging (1K–10K)" },
            new { id = "growing", label = "Growing (10K–100K)" },
            new { id = "established", label = "Established (100K–1M)" },
            new { id = "major", label = "Major (1M+)" },
            new { id = "strategic", label = "Strategic (manual)" },
            new { id = "unknown", label = "Unknown" }
        },
        contentFormats = new[]
        {
            new { id = "long_form", label = "Long form" },
            new { id = "shorts", label = "Shorts" },
            new { id = "mixed", label = "Mixed" },
            new { id = "unknown", label = "Unknown" }
        },
        rollout = new
        {
            phase1 = new[] { "cooking/en", "cooking/ru" },
            phase2 = new[] { "technology/en", "fitness/en", "business/en", "education/en", "entertainment/en", "technology/ru", "fitness/ru" },
            phase3 = new[] { "cooking/en/IN", "cooking/hi/IN", "technology/en/IN", "technology/hi/IN" },
            phase4 = new[] { "es", "pt" },
            autoAdvance = false
        }
    };
}
