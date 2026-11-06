import wave from "@/assets/wave-hero.jpg";
import villa from "@/assets/resort-villa.jpg";
import aerial from "@/assets/aerial-reef.jpg";
import dining from "@/assets/dining-deck.jpg";

export const IMAGE_LIBRARY = [
  { id: "wave", url: wave, label: "Reef barrel, lineup", permission: "Salt Atlas owned" },
  { id: "villa", url: villa, label: "Beachfront bungalow", permission: "Resort supplied · licensed" },
  { id: "aerial", url: aerial, label: "Aerial reef passes", permission: "Salt Atlas owned" },
  { id: "dining", url: dining, label: "Dining deck", permission: "Resort supplied · licensed" },
] as const;

export const IMG = { wave, villa, aerial, dining };
