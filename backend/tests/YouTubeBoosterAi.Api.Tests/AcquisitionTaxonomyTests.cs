using Xunit;
using YouTubeBoosterAi.Api;

namespace YouTubeBoosterAi.Api.Tests;

public class AcquisitionTaxonomyTests
{
    [Fact]
    public void Cooking_Is_Default_Primary_Category()
    {
        Assert.Equal("cooking", AcquisitionTaxonomy.DefaultCategory);
        Assert.Equal("COOK-001", AcquisitionTaxonomy.DefaultCampaign);
        Assert.Equal("cooking", AcquisitionTaxonomy.NormalizeCategory(null));
        Assert.Equal("cooking", AcquisitionTaxonomy.NormalizeCategory("food"));
    }

    [Fact]
    public void Languages_And_India_Are_Configurable()
    {
        Assert.Equal("en", AcquisitionTaxonomy.NormalizeLanguage("English"));
        Assert.Equal("ru", AcquisitionTaxonomy.NormalizeLanguage("ru-RU"));
        Assert.Equal("hi", AcquisitionTaxonomy.NormalizeLanguage("hindi"));
        Assert.Equal("IN", AcquisitionTaxonomy.NormalizeMarket("India"));
        Assert.True(AcquisitionTaxonomy.LanguageRequiresManualReview("hi"));
        Assert.False(AcquisitionTaxonomy.LanguageRequiresManualReview("en"));
        Assert.True(AcquisitionTaxonomy.IsChinaPriorityBlocked("CN"));
        Assert.False(AcquisitionTaxonomy.IsChinaPriorityBlocked("IN"));
    }

    [Fact]
    public void Tiers_And_Format_Do_Not_Guess()
    {
        Assert.Equal("emerging", AcquisitionTaxonomy.DeriveTier(2500));
        Assert.Equal("growing", AcquisitionTaxonomy.DeriveTier(40000));
        Assert.Equal("strategic", AcquisitionTaxonomy.DeriveTier(40000, strategic: true));
        Assert.Equal("unknown", AcquisitionTaxonomy.GuessContentFormat(Array.Empty<string>()));
        Assert.Equal("shorts", AcquisitionTaxonomy.GuessContentFormat(["#shorts dinner", "#Shorts lunch"]));
        Assert.Equal("long_form", AcquisitionTaxonomy.GuessContentFormat(["Sunday roast recipe"]));
    }
}
