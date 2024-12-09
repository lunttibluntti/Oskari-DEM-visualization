import './style.css';
import { Map, View } from 'ol';
import { Image as ImageLayer, Tile as TileLayer} from 'ol/layer';
import WebGLTileLayer from 'ol/layer/WebGLTile.js';
import { XYZ, Raster as RasterSource, OSM, GeoTIFF, ImageWMS, TileWMS, WMTS } from 'ol/source';
import proj4 from 'proj4';
import {register} from 'ol/proj/proj4.js';  

proj4.defs("EPSG:3067","+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
register(proj4);

// Apufunktioita rgb-enkoodatun korkeustiedon käsittelyyn (https://documentation.maptiler.com/hc/en-us/articles/4405444055313-RGB-Terrain-by-MapTiler)
const decodeElevation = ([R, G, B]) => {
  return -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1);
};

const scaleElevation = (elevation, min, max) => {
  return ((elevation - min) / (max - min)) * 255
}

// Geotiff-kuvan (korkeusmalli) haku
// Koodi hakee kuvan public-kansiosta
const sampleTiff = new GeoTIFF({ 
  sources: [{
    // Pienempää testi-korkeusmallia varten käytä "url: './P3344Ecog.tif',"
    // Tässä tapauksessa min ja max tulee muuttaa vastaamaan testi-korkeusmallin minimi ja maksimi -korkeustietoja.
    // Koko maan kattavan cloud optimized geotiff-muotoisen (COG) dem10.tif-tiedoston saa ladattua osoitteesta:
    // https://latuviitta.kapsi.fi/data/dem10m/, jonka jälkeen sen voi siirtää public-kansioon.
    // Geotiff-tiedoston tulee olla cloud optimized. Jos geotiff ei sitä ole jo valmiiksi, sen voi muuttaa
    // esimerkiksi gdalin avulla: https://gdal.org/en/latest/drivers/raster/cog.html 
    url: './dem10.tif',   
    min: -2,
    max: 1325,
    nodata: -9999
  }],
  projection: 'EPSG:3067',
  normalize: true,
});

// Geotiffista tehdään WebGLTileLayer
const verkkoTiiliTaso = new WebGLTileLayer({source: sampleTiff})


// dynaaminen värjäys
const raster3067 = new RasterSource({ 
  sources: [verkkoTiiliTaso], 
  operationType: 'image',
  operation: (imageData, data) => {
    const elevationImage = imageData[0].data;
    const pixelCount = imageData[0].width * imageData[0].height;
    let pixel, elevation, pixelValue;
    const elevationData = new Array(pixelCount)
    let minE = 1667721.5, maxE = -10000;
    
    // Korkeusarvojen purkaminen ja minimi- ja maksimiarvojen määrittäminen
    for (let i = 0; i < pixelCount; i++) {
      pixel = elevationImage.slice(i*4, i*4+4);
      if (pixel[3] === 0) { // NoData-arvo
        elevationData[i] = -10000;
        continue;
      }
      elevationData[i] = decodeElevation(pixel.slice(0, 3));
      if (elevationData[i] === -10000) {
        continue;
      }
      if (elevationData[i] > maxE) {
        maxE = elevationData[i];
      }
      if (elevationData[i] < minE) {
        minE = elevationData[i];
      }
    }
    
    // Väriarvot, 14 eri luokkaa
    const colors = [
      [0, 64, 128],   
      [0, 128, 128],  
      [0, 160, 64],   
      [0, 176, 64],   
      [0, 192, 64],   
      [64, 192, 64],  
      [128, 192, 64], 
      [160, 192, 32], 
      [192, 192, 32], 
      [224, 160, 0],  
      [255, 128, 0],  
      [255, 64, 0],   
      [255, 32, 0],   
      [255, 0, 0]     
    ];

    // Korkeusarvot luokkiin ja värit interpolointiin
    const elevationDisplayData = new Uint8ClampedArray(elevationImage.length);
    for (let i = 0; i < pixelCount; i++) {
      if (elevationData[i] === -10000) {
        elevationDisplayData[i*4] = 0;  // Musta väri, jos NoData
        elevationDisplayData[i*4+1] = 0;
        elevationDisplayData[i*4+2] = 0;
        elevationDisplayData[i*4+3] = 0;
        continue;
      }

      // Korkeusarvon normalisointi välillä 0-1
      const normalizedElevation = (elevationData[i] - minE) / (maxE - minE);

      // Löydetään oikea luokka
      const classIndex = Math.min(Math.floor(normalizedElevation * 14), 13);  // 14 luokkaa (0-13)

      // Interpoloidaan värit luokkien välillä
      const lowerClass = classIndex;
      const upperClass = Math.min(classIndex + 1, 13);
      const lowerColor = colors[lowerClass];
      const upperColor = colors[upperClass];

      // Interpoloidaan värit
      const weight = normalizedElevation * 14 - classIndex;
      const red = Math.round(lowerColor[0] * (1 - weight) + upperColor[0] * weight);
      const green = Math.round(lowerColor[1] * (1 - weight) + upperColor[1] * weight);
      const blue = Math.round(lowerColor[2] * (1 - weight) + upperColor[2] * weight);

      // Tallennetaan värit pikseliin
      elevationDisplayData[i*4] = red;
      elevationDisplayData[i*4+1] = green;
      elevationDisplayData[i*4+2] = blue;
      elevationDisplayData[i*4+3] = 255; // Täysi läpinäkyvyys
    }

    return {data: elevationDisplayData, width: imageData.width, height: imageData.height};
  },
  lib: {
    decodeElevation: decodeElevation,
    scaleElevation: scaleElevation,
  }
});


// taso, jossa luodaan rinnevalovarjostus joka saa värit dynaamisen värjäyksen mukaisesti
// rinnevalovarjostukseen on otettu mallia tästä koodista: https://openlayers.org/en/latest/examples/shaded-relief.html
const shadedRasterSource = new RasterSource({
  sources: [verkkoTiiliTaso],
  operationType: 'image',
  operation: (inputs, data) => {
    const elevationImage = inputs[0];
    const width = elevationImage.width;
    const height = elevationImage.height;
    const elevationData = elevationImage.data;
    const shadedData = new Uint8ClampedArray(elevationData.length);

    const dp = data.resolution * 2;
    const sunEl = (Math.PI * data.sunEl) / 180;
    const sunAz = (Math.PI * data.sunAz) / 180;
    const cosSunEl = Math.cos(sunEl);
    const sinSunEl = Math.sin(sunEl);
    const vert = data.vert;

    const pixelCount = width * height;

    let minE = 1667721.5, maxE = -10000;

    // Dynaamisen värityksen värit
    const colors = [
      [0, 64, 128],   [0, 128, 128],  [0, 160, 64],
      [0, 176, 64],   [0, 192, 64],   [64, 192, 64],
      [128, 192, 64], [160, 192, 32], [192, 192, 32],
      [224, 160, 0],  [255, 128, 0],  [255, 64, 0],
      [255, 32, 0],   [255, 0, 0]
    ];

    // Apufunktio korkeuden laskemiseen
    function calculateElevation(pixel) {
      return vert * decodeElevation(pixel);
    }


    // Korkeusarvojen purkaminen ja minimi- ja maksimiarvojen määrittäminen
    const elevations = new Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      const pixel = elevationData.slice(offset, offset + 4);
      if (pixel[3] === 0) { // NoData
        elevations[i] = -10000;
        continue;
      }
      elevations[i] = calculateElevation(pixel);
      if (elevations[i] > maxE) maxE = elevations[i];
      if (elevations[i] < minE) minE = elevations[i];
    }

    // Rinnevarjostus ja dynaaminen väritys
    for (let pixelY = 0; pixelY < height; ++pixelY) {
      const y0 = pixelY === 0 ? 0 : pixelY - 1;
      const y1 = pixelY === height - 1 ? height - 1 : pixelY + 1;

      for (let pixelX = 0; pixelX < width; ++pixelX) {
        const x0 = pixelX === 0 ? 0 : pixelX - 1;
        const x1 = pixelX === width - 1 ? width - 1 : pixelX + 1;

        let offset = (pixelY * width + x0) * 4;
        let pixel = elevationData.slice(offset, offset + 4);
        let z0 = calculateElevation(pixel);

        offset = (pixelY * width + x1) * 4;
        pixel = elevationData.slice(offset, offset + 4);
        let z1 = calculateElevation(pixel);
        const dzdx = (z1 - z0) / dp;

        offset = (y0 * width + pixelX) * 4;
        pixel = elevationData.slice(offset, offset + 4);
        z0 = calculateElevation(pixel);

        offset = (y1 * width + pixelX) * 4;
        pixel = elevationData.slice(offset, offset + 4);
        z1 = calculateElevation(pixel);
        const dzdy = (z1 - z0) / dp;

        const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        let aspect = Math.atan2(dzdy, -dzdx);
        if (aspect < 0) {
          aspect = Math.PI / 2 - aspect;
        } else if (aspect > Math.PI / 2) {
          aspect = 2 * Math.PI - aspect + Math.PI / 2;
        } else {
          aspect = Math.PI / 2 - aspect;
        }

        const cosIncidence =
          sinSunEl * Math.cos(slope) +
          cosSunEl * Math.sin(slope) * Math.cos(sunAz - aspect);

        const normalizedElevation = (elevations[pixelY * width + pixelX] - minE) / (maxE - minE);
        const classIndex = Math.min(Math.floor(normalizedElevation * 14), 13);
        const lowerColor = colors[classIndex];
        const upperColor = colors[Math.min(classIndex + 1, 13)];
        const weight = normalizedElevation * 14 - classIndex;

        const red = Math.round(lowerColor[0] * (1 - weight) + upperColor[0] * weight);
        const green = Math.round(lowerColor[1] * (1 - weight) + upperColor[1] * weight);
        const blue = Math.round(lowerColor[2] * (1 - weight) + upperColor[2] * weight);

        offset = (pixelY * width + pixelX) * 4;
        scaled = 255 * cosIncidence;

        
        
        if (cosIncidence > 0) {
          // Valoisat kohdat: täysin läpinäkyvät
          shadedData[offset] = 0;
          shadedData[offset + 1] = 0;
          shadedData[offset + 2] = 0;
          shadedData[offset + 3] = 0;
        } else {
          // Varjoisat kohdat: dynaaminen väritys
          shadedData[offset] = red;
          shadedData[offset + 1] = green;
          shadedData[offset + 2] = blue;
          shadedData[offset + 3] = 255; // Ei läpinäkyvyyttä
          
        }
        
      }
    }

    return { data: shadedData, width, height };
  },
  lib: {
    decodeElevation: decodeElevation,
  }
});


// dynaamisen värjäyksen sekä luodun rinnevalovarjosteen "blend multiply" 
// tasot kerrotaan keskenään, mikäli kummankaan tason pikselin arvo ei ole täysin läpinäkyvä
// tällöin pikselit, jotka ovat täysin valossa (tai halutun kohteen ulkopuolella) saavat 
// dynaamisen värjäyksen mukaisen värin, ja varjoisat kohdat saavat dynaamisen värjäyksen 
// ja rinnevalovarjosteen (joka perustuu dynaamiseen värjäykseen) kertoman
const blendedRasterSource = new RasterSource({
  sources: [raster3067, shadedRasterSource],
  operation: (pixels, data) => {
    const base = pixels[0];
    const overlay = pixels[1];
    const blended = new Uint8ClampedArray(base.length);

    for (let i = 0; i < base.length; i += 4) {
      // Tarkistetaan alpha-kanava: jos pikseli on täysin läpinäkyvä, ei tehdä muutoksia, vain dynaamisen värjäyksen rasteri näkyy
      if (base[i + 3] === 0 || overlay[i + 3] === 0) {
        blended[i] = base[i];       // Red-kanava
        blended[i + 1] = base[i + 1]; // Green-kanava
        blended[i + 2] = base[i + 2]; // Blue-kanava
        blended[i + 3] = base[i + 3]; // Alpha-kanava
      } else {
        // Blendataan normaalisti (multiply)
        blended[i] = (base[i] * overlay[i]) / 255;       // Red-kanava
        blended[i + 1] = (base[i + 1] * overlay[i + 1]) / 255; // Green-kanava
        blended[i + 2] = (base[i + 2] * overlay[i + 2]) / 255; // Blue-kanava
        blended[i + 3] = 255; // Alpha täysi
      }
    }
    return blended;
  },
});


/*
// Valmiiksi lasketun rinnevalovarjosteen lisäys.
// Valmiiksi laskettu rinnevalovarjoste on saatavilla esimerkiksi: https://asiointi.maanmittauslaitos.fi/karttapaikka/tiedostopalvelu/rinnevarjoste?lang=en
// Muuttuja ottaa vastaan rasterilaatoista koostuvan tason.

const vinovaloLayer = new TileLayer({
  title: "Rinnevaovarjoste",
  source: new XYZ({
      attribution: "Example", // lisää attribution lähteen perusteella
      url: 'https://example.fi/examplemap/{z}/{x}/{y}.png', // korvaa lähteellä rasterilaattatasoon
      maxzoom: 14
  })
})

vinovaloLayer.on('prerender', (event) => {
  const ctx = event.context;
  ctx.globalCompositeOperation = 'normal'; // vinovalovarjoste peittää dynaamisen värjäyksen tason joko kokonaan tai osittain, riippuen vinovalovarjosteen läpinäkyvyydestä eli alpha-arvosta
});

vinovaloLayer.on('postrender', (event) => {
  const ctx = event.context;
  ctx.globalCompositeOperation = 'normal';
});
*/


// Karttatasojen luonti
// Taustakartta
const osmLayer = new TileLayer({
  source: new OSM(),
});
// Dynaaminen värjäys
const dynamicLayer = new ImageLayer({
  source: raster3067,
  visible: true, // Näkyvissä oletuksena
});
// Dynaaminen värjäys rinnevalovarjosteen kanssa
const hillshadeLayer = new ImageLayer({
  source: blendedRasterSource,
  visible: false, // Piilotettu oletuksena
});
// Pelkkä rinnevalovarjoste
const onlyhillshade = new ImageLayer({
  source: shadedRasterSource,
  visible: false,
});


// Karttanäkymän luonti
const map = new Map({
  target: 'map',
  layers: [osmLayer, dynamicLayer, hillshadeLayer], // vinovaloLayer-tason tai onlyhillshade-tason voi lisätä halutessaan kartalle 
  view: new View({
    zoom: 7,
    center: [392000, 7188000],
    projection: 'EPSG:3067',
  }),
});


// Valikot ja säätimet

// Valikon luonti
const select = document.createElement('select');

// valikko
// Lisää <option value="hillshade2">Dynamic Color with png Hillshade</option>, mikäli käytetään 
// valmiiksi luotua rinnevalovarjostetta
select.innerHTML = `
  <option value="dynamic">Dynamic Color</option>
  <option value="hillshade">Dynamic Color with Hillshade</option>
`;
select.style.position = 'absolute';
select.style.top = '10px';
select.style.right = '10px';
select.style.zIndex = '1000'; 
select.style.background = 'white';
select.style.padding = '5px';
select.style.border = '1px solid black';
select.style.borderRadius = '5px';
document.body.appendChild(select);

// valikon muutos
select.addEventListener('change', (event) => {
  const value = event.target.value;
  dynamicLayer.setVisible(value === 'dynamic'); // korjaa (value === 'dynamic' || value === 'hillshade2');, jos haluat käyttää valmiiksi laskettua rinnevalovarjostetta
  hillshadeLayer.setVisible(value === 'hillshade');
  //vinovaloLayer.setVisible(value === 'hillshade2'); // poista kommentti, jos haluat käyttää valmiiksi laskettua rinnevalovarjostetta

  //poista allaolevan koodinpätkän kommentointi, jos haluat käyttää rinnevalovarjostetta
  /* 
  if (value === 'hillshade2') {
    vinovaloLayer.setZIndex(2);  // Korkeampi z-indeksi, jotta tämä on päällä
    dynamicLayer.setZIndex(1);  // Alempi z-indeksi
  }
  */
});


// Säätimien luonti (sun elevation ja azimuth)
const controls = ['sunEl', 'sunAz'];
const controlElements = {};

// säädin
const controlsContainer = document.createElement('div');
controlsContainer.style.position = 'absolute';
controlsContainer.style.bottom = '10px';
controlsContainer.style.left = '10px';
controlsContainer.style.zIndex = '1000';
controlsContainer.style.background = 'rgba(255, 255, 255, 0.8)';
controlsContainer.style.padding = '10px';
controlsContainer.style.borderRadius = '8px';
controlsContainer.style.border = '1px solid black';

// säätimen vaihtoehdot
controls.forEach((id) => {
  const label = document.createElement('label');
  label.innerText = `${id === 'sunEl' ? 'Sun elevation' : 'Sun azimuth'}:`;
  label.style.display = 'block';

  const input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = id === 'sunEl' ? '0' : '0';
  input.max = id === 'sunEl' ? '90' : '360';
  input.value = id === 'sunEl' ? '45' : '135';
  input.style.width = '100%';

  const output = document.createElement('span');
  output.id = `${id}Out`;
  output.innerText = input.value;

  // säätimen muutos
  input.addEventListener('input', () => {
    output.innerText = input.value;
    shadedRasterSource.changed(); 
  });

  controlElements[id] = input;

  const container = document.createElement('div');
  container.appendChild(label);
  container.appendChild(input);
  container.appendChild(output);
  controlsContainer.appendChild(container);
});

document.body.appendChild(controlsContainer);

// Päivitä rasteridatan arvot ennen sen prosessointia
shadedRasterSource.on('beforeoperations', (event) => {
  const data = event.data;
  data.resolution = event.resolution;
  data.vert = 3; //vertikaalinen korostus on default-arvona 3
  data.sunEl = parseFloat(controlElements.sunEl.value); // esimerkki-arvo voisi olla esim. 45, mikäli ei haluta säädintä
  data.sunAz = parseFloat(controlElements.sunAz.value); // esimerkki-arvo voisi olla esim. 135, mikäli ei haluta säädintä
});

