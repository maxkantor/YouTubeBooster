namespace YouTubeBoosterAi.Api;

/// <summary>
/// YouTube search queries and qualification for scoped creator discovery.
/// Cooking remains the default/primary cohort. Expansion cohorts are additive.
/// </summary>
public static class AcquisitionDiscoveryQueries
{
    public const int DefaultTarget = 25;
    public const int MaxTarget = 30;
    public const int MinSubscribers = 1000;
    public const int MaxSubscribersPreferred = 100_000;
    public const int MaxSubscribersHard = 250_000;

    public static int ClampTarget(int? requested) =>
        Math.Clamp(requested is > 0 ? requested.Value : DefaultTarget, 5, MaxTarget);

    public static IReadOnlyList<string> QueriesFor(string category, string? language, string? market)
    {
        var cat = AcquisitionTaxonomy.NormalizeCategory(category);
        var lang = string.IsNullOrWhiteSpace(language) ? "" : AcquisitionTaxonomy.NormalizeLanguage(language);
        var marketKey = AcquisitionTaxonomy.NormalizeMarket(market);
        var india = marketKey == "IN";

        string[] list = (cat, lang, india) switch
        {
            ("cooking", "ru", _) => ["рецепты домашняя кухня", "готовим дома рецепты", "кулинария канал рецепты"],
            ("cooking", "hi", true) => ["खाना पकाना रेसिपी", "Indian cooking recipes Hindi", "घर का खाना रेसिपी चैनल"],
            ("cooking", "hi", _) => ["खाना पकाना रेसिपी", "Hindi cooking recipes", "घर का खाना रेसिपी"],
            ("cooking", "en", true) => ["Indian cooking recipes English", "home cooking India English", "vegetarian recipes India"],
            ("cooking", _, _) => ["home cooking recipes", "homemade recipes channel", "weeknight cooking recipes"],

            ("technology", "ru", _) => ["технологии искусственный интеллект", "программирование канал", "нейросети обзор"],
            ("technology", "hi", true) => ["टेक्नोलॉजी एआई हिंदी", "programming India Hindi", "टेक्नोलॉजी चैनल हिंदी"],
            ("technology", "hi", _) => ["टेक्नोलॉजी एआई हिंदी", "Hindi technology AI", "प्रोग्रामिंग हिंदी"],
            ("technology", "en", true) => ["technology AI India English", "programming India English", "artificial intelligence India"],
            ("technology", _, _) => ["technology AI programming", "artificial intelligence explainer", "software engineering channel"],

            ("fitness", "ru", _) => ["фитнес тренировки дома", "спорт упражнения канал", "тренировка дома"],
            ("fitness", "en", true) => ["fitness workout India English", "home workout India", "yoga fitness India English"],
            ("fitness", "hi", _) => ["फिटनेस वर्कआउट हिंदी", "योग व्यायाम चैनल", "fitness Hindi workout"],
            ("fitness", _, _) => ["home workout fitness", "strength training channel", "fitness sports training"],

            ("business", "ru", _) => ["бизнес предпринимательство", "стартап канал", "предприниматель советы"],
            ("business", "en", true) => ["entrepreneurship India English", "startup business India", "small business India English"],
            ("business", "hi", _) => ["बिज़नेस उद्यमिता हिंदी", "स्टार्टअप हिंदी चैनल", "business Hindi entrepreneurship"],
            ("business", _, _) => ["entrepreneurship small business", "startup founder channel", "business advice creators"],

            ("education", "ru", _) => ["образование обучение канал", "учеба объяснение", "образовательный канал"],
            ("education", "en", true) => ["education explainer India English", "study skills India", "learning channel India English"],
            ("education", "hi", true) => ["शिक्षा हिंदी चैनल", "पढ़ाई समझाओ हिंदी", "education Hindi India"],
            ("education", "hi", _) => ["शिक्षा हिंदी चैनल", "पढ़ाई हिंदी", "education Hindi"],
            ("education", _, _) => ["education explainer channel", "study skills learning", "educational YouTube teacher"],

            ("entertainment", "ru", _) => ["развлечения канал", "скетчи юмор", "развлекательный канал"],
            ("entertainment", "en", true) => ["entertainment India English", "comedy sketches India English", "variety entertainment India"],
            ("entertainment", "hi", true) => ["मनोरंजन हिंदी चैनल", "कॉमेडी हिंदी", "entertainment Hindi India"],
            ("entertainment", "hi", _) => ["मनोरंजन हिंदी चैनल", "कॉमेडी हिंदी", "entertainment Hindi"],
            ("entertainment", _, _) => ["entertainment comedy sketches", "variety entertainment channel", "storytelling entertainment"],

            _ => [cat + " YouTube channel", cat + " creator"]
        };

        return list.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public static string? RelevanceLanguage(string? language)
    {
        if (string.IsNullOrWhiteSpace(language)) return null;
        return AcquisitionTaxonomy.NormalizeLanguage(language) switch
        {
            "ru" => "ru",
            "hi" => "hi",
            "en" => "en",
            "es" => "es",
            "pt" => "pt",
            "uk" => "uk",
            _ => null
        };
    }

    public static string? RegionCode(string? market)
    {
        var key = AcquisitionTaxonomy.NormalizeMarket(market);
        return string.IsNullOrWhiteSpace(key) || key == "OTHER" ? null : key;
    }

    public static string DetectScriptLanguage(string? text)
    {
        var blob = text ?? "";
        if (blob.Any(c => c is >= '\u0900' and <= '\u097F')) return "hi";
        if (blob.Any(c => c is >= '\u0400' and <= '\u04FF'))
            return blob.Contains('і') || blob.Contains('ї') || blob.Contains('є') || blob.Contains('ґ') ? "uk" : "ru";
        return "en";
    }

    public static bool LanguageMatches(string? requestedLanguage, string title, string? description)
    {
        if (string.IsNullOrWhiteSpace(requestedLanguage)) return true;
        var want = AcquisitionTaxonomy.NormalizeLanguage(requestedLanguage);
        var detected = DetectScriptLanguage(title + " " + (description ?? ""));
        if (want == "ru") return detected == "ru";
        if (want == "hi") return detected == "hi";
        if (want == "en") return detected == "en";
        return detected == want;
    }

    public static bool CategoryMatches(string category, string title, string? description)
    {
        var blob = ((title ?? "") + " " + (description ?? "")).ToLowerInvariant();
        var cat = AcquisitionTaxonomy.NormalizeCategory(category);
        string[] needles = cat switch
        {
            "cooking" => ["cook", "recipe", "food", "kitchen", "рецепт", "кухн", "еда", "готов", "खाना", "रेसिपी", "पकवान"],
            "technology" => ["tech", "ai ", "artificial", "software", "program", "code", "нейро", "технолог", "програм", "टेक्न", "एआई", "कोड"],
            "fitness" => ["fit", "workout", "gym", "sport", "yoga", "train", "фитнес", "тренир", "спорт", "फिटनेस", "योग", "व्यायाम"],
            "business" => ["business", "startup", "entrepreneur", "founder", "бизнес", "стартап", "предприн", "बिज़नेस", "स्टार्टअप", "उद्यम"],
            "education" => ["educat", "learn", "study", "lesson", "tutor", "обучен", "образован", "учёб", "शिक्षा", "पढ़ाई", "पाठ"],
            "entertainment" => ["entertain", "comedy", "sketch", "vlog", "funny", "развлеч", "юмор", "скетч", "मनोरंजन", "कॉमेडी"],
            _ => [cat]
        };
        return needles.Any(n => blob.Contains(n, StringComparison.Ordinal));
    }

    public static string? ReliableMarket(string? requestedMarket, string? channelCountry)
    {
        var requested = AcquisitionTaxonomy.NormalizeMarket(requestedMarket);
        var country = AcquisitionTaxonomy.NormalizeMarket(channelCountry);
        if (string.IsNullOrWhiteSpace(country)) return "";
        if (string.IsNullOrWhiteSpace(requested)) return country is "IN" or "US" or "GB" ? country : "";
        return string.Equals(requested, country, StringComparison.OrdinalIgnoreCase) ? country : "";
    }

    public static string? Qualify(
        string category,
        string? language,
        string? market,
        string title,
        string? description,
        string? country,
        long subscribers,
        long videoCount)
    {
        if (string.IsNullOrWhiteSpace(title)) return "missing_title";
        if (videoCount <= 0) return "inactive";
        if (subscribers > 0 && subscribers < MinSubscribers) return "below_band";
        if (subscribers > MaxSubscribersHard) return "above_band";
        if (!CategoryMatches(category, title, description)) return "category_mismatch";
        if (!LanguageMatches(language, title, description)) return "language_mismatch";
        var requested = AcquisitionTaxonomy.NormalizeMarket(market);
        if (requested == "IN")
        {
            var got = AcquisitionTaxonomy.NormalizeMarket(country);
            if (!string.IsNullOrWhiteSpace(got) && got != "IN") return "market_mismatch";
        }
        return null;
    }

    public static string ResolveDiscoveryCampaign(string category) =>
        AcquisitionTaxonomy.NormalizeCategory(category) == AcquisitionTaxonomy.DefaultCategory
            ? CreatorAcquisitionCampaigns.Cook001
            : CreatorAcquisitionCampaigns.Cook001;
}
