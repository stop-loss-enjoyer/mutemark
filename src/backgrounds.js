// Background images that ship with Mutemark, in the order of the gallery in Settings.
// All are in the public domain or under CC0 1.0. Full credits in THIRD_PARTY_NOTICES.md.
// Loaded in <head> before settings.js, so the chosen image applies without a flash.
// tone: whether the picture is mostly light or dark. The veil over it gets stronger
// when the theme is the opposite, so text stays readable on any pairing.

const BACKGROUNDS = [
  { id: "tetons-aurora", title: "Northern Lights Over the Tetons", tone: "dark",
    author: "C. Adams, National Park Service", license: "Public domain",
    source: "https://www.flickr.com/photos/grandtetonnps/52843673285" },
  { id: "earth-crescent-orion", title: "Our Home Planet", tone: "dark",
    author: "NASA, Artemis II crew", license: "Public domain",
    source: "https://images.nasa.gov/details/art002e004462" },
  { id: "aiguille-rousse-clouds", title: "Aiguille Rousse in a Sea of Clouds", tone: "light",
    author: "DimiTalen", license: "CC0 1.0",
    source: "https://commons.wikimedia.org/wiki/File:Aiguille_Rousse_in_sea_of_clouds,_2018.jpg" },
  { id: "arctic-curves", title: "Curves", tone: "dark",
    author: "Patrick Kelley, U.S. Coast Guard", license: "Public domain",
    source: "https://www.flickr.com/photos/usgeologicalsurvey/4370264559/" },
  { id: "earthset-lunar-horizon", title: "Earthset", tone: "dark",
    author: "NASA, Artemis II crew", license: "Public domain",
    source: "https://images.nasa.gov/details/art002e009288" },
  { id: "lake-mcdonald-still", title: "Lake McDonald", tone: "dark",
    author: "Jacob W. Frank, National Park Service", license: "Public domain",
    source: "https://www.flickr.com/photos/glaciernps/26221614832" },
  { id: "elk-refuge-moody-fog", title: "Moody Fog", tone: "light",
    author: "Kari Cieszkiewicz, U.S. Fish and Wildlife Service", license: "Public domain",
    source: "https://www.flickr.com/photos/usfwsmtnprairie/50617209527/" },
  { id: "orbital-sunset-layers", title: "Sunrise over Earth's Limb", tone: "dark",
    author: "NASA, Expedition 28 crew", license: "Public domain",
    source: "https://images.nasa.gov/details/iss028e007274" },
  { id: "lamar-valley-fog", title: "Foggy Morning near Tower Junction", tone: "light",
    author: "Jacob W. Frank, National Park Service", license: "Public domain",
    source: "https://www.flickr.com/photos/yellowstonenps/50513732883" },
  { id: "blue-marble-apollo17", title: "The Blue Marble", tone: "dark",
    author: "NASA, Apollo 17 crew", license: "Public domain",
    source: "https://images.nasa.gov/details/as17-148-22727" },
  { id: "white-sands-golden", title: "Golden Dunes", tone: "dark",
    author: "National Park Service", license: "Public domain",
    source: "https://npgallery.nps.gov/AssetDetail/fc880478-155d-451f-67d2-fc539b8fd5de" },
  { id: "mowich-lake-fog", title: "Fog on Mowich Lake", tone: "light",
    author: "National Park Service", license: "Public domain",
    source: "https://npgallery.nps.gov/AssetDetail/99638561-ecab-4c5a-9d86-5016fc049ef4" },
  { id: "moon-over-earth-limb", title: "View of Moonset", tone: "dark",
    author: "Christina Koch, NASA", license: "Public domain",
    source: "https://images.nasa.gov/details/iss061e003881" },
];

// The photos a fresh install starts with, one for each theme: a dark one under the dark
// theme and a light one under the light theme, so the veil stays thin and the photo shows.
const DEFAULT_BACKGROUND = "arctic-curves";
const DEFAULT_BACKGROUND_LIGHT = "aiguille-rousse-clouds";

function findBackground(id) {
  return BACKGROUNDS.find((bg) => bg.id === id) ?? null;
}
