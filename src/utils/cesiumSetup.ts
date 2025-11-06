declare global {
  interface Window {
    Cesium: any;
    CESIUM_BASE_URL: string;
  }
}

let cesiumLoaded = false;

export const loadCesiumFromCDN = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve({});
      return;
    }

    if (window.Cesium && cesiumLoaded) {
      resolve(window.Cesium);
      return;
    }

    // Set the base URL to Cesium's CDN
    window.CESIUM_BASE_URL =
      "https://cesium.com/downloads/cesiumjs/releases/1.133/Build/Cesium/";

    // Load Cesium CSS
    if (!document.querySelector('link[href*="widgets.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://cesium.com/downloads/cesiumjs/releases/1.133/Build/Cesium/Widgets/widgets.css";
      document.head.appendChild(link);
    }

    // Load Cesium JS
    if (!document.querySelector('script[src*="Cesium.js"]')) {
      const script = document.createElement("script");
      script.src =
        "https://cesium.com/downloads/cesiumjs/releases/1.133/Build/Cesium/Cesium.js";

      script.onerror = () => {
        console.error("Failed to load Cesium from CDN");
        reject(new Error("Failed to load Cesium script from CDN"));
      };

      document.head.appendChild(script);
    } else {
      // Script already exists, wait a bit and check again
      setTimeout(() => {
        if (window.Cesium) {
          cesiumLoaded = true;
          resolve(window.Cesium);
        } else {
          reject(new Error("Cesium script loaded but not available"));
        }
      }, 1000);
    }
  });
};

export default loadCesiumFromCDN;
