using YouTubeBoosterAi.Api;
using Xunit;

namespace YouTubeBoosterAi.Api.Tests;

public class AcquisitionDiscoveryQueriesTests
{
    [Fact]
    public void Russian_tech_queries_are_russian()
    {
        var q = AcquisitionDiscoveryQueries.QueriesFor("technology", "ru", null);
        Assert.Contains(q, s => s.Contains("технолог", StringComparison.OrdinalIgnoreCase));
        Assert.Equal("ru", AcquisitionDiscoveryQueries.RelevanceLanguage("ru"));
    }

    [Fact]
    public void Hindi_india_education_uses_hindi_and_india_region()
    {
        var q = AcquisitionDiscoveryQueries.QueriesFor("education", "hi", "IN");
        Assert.True(q.Any(s => s.Contains("शिक्षा") || s.Contains("Hindi")));
        Assert.Equal("hi", AcquisitionDiscoveryQueries.RelevanceLanguage("hi"));
        Assert.Equal("IN", AcquisitionDiscoveryQueries.RegionCode("India"));
    }

    [Fact]
    public void Language_match_requires_script_for_russian_and_hindi()
    {
        Assert.True(AcquisitionDiscoveryQueries.LanguageMatches("ru", "Технологии ИИ", "обзор нейросетей"));
        Assert.False(AcquisitionDiscoveryQueries.LanguageMatches("ru", "AI technology explainer", "software"));
        Assert.True(AcquisitionDiscoveryQueries.LanguageMatches("hi", "शिक्षा चैनल", "पढ़ाई"));
        Assert.True(AcquisitionDiscoveryQueries.LanguageMatches("en", "Home cooking recipes", "weeknight meals"));
        Assert.False(AcquisitionDiscoveryQueries.LanguageMatches("en", "Домашние рецепты", "кухня"));
    }

    [Fact]
    public void Market_is_blank_when_country_unknown()
    {
        Assert.Equal("", AcquisitionDiscoveryQueries.ReliableMarket("IN", null));
        Assert.Equal("IN", AcquisitionDiscoveryQueries.ReliableMarket("IN", "IN"));
        Assert.Equal("", AcquisitionDiscoveryQueries.ReliableMarket("IN", "US"));
    }

    [Fact]
    public void Qualify_rejects_inactive_and_wrong_category()
    {
        Assert.Equal("inactive", AcquisitionDiscoveryQueries.Qualify(
            "technology", "en", null, "AI Explained", "software", null, 12000, 0));
        Assert.Equal("category_mismatch", AcquisitionDiscoveryQueries.Qualify(
            "technology", "en", null, "Best Chocolate Cake", "baking recipes", null, 12000, 40));
        Assert.Null(AcquisitionDiscoveryQueries.Qualify(
            "technology", "ru", null, "Технологии и ИИ", "программирование", null, 18000, 40));
    }

    [Fact]
    public void Cooking_discovery_stays_on_cook_001()
    {
        Assert.Equal("COOK-001", AcquisitionDiscoveryQueries.ResolveDiscoveryCampaign("cooking"));
        Assert.Equal("COOK-001", AcquisitionDiscoveryQueries.ResolveDiscoveryCampaign("technology"));
    }
}
