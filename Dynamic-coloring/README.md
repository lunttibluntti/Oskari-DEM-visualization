# Dynamic DEM visualization with OpenLayers

A simple web application built with OpenLayers. Uses Raster source to dynamically scale the colors to cover the visible value range.

This code uses Antti Järvenpää's ol-demview demo code (available at: https://github.com/jarvena/ol-demview) as a base and builds on it. The modifications were done by Ronja Hiironen and Eino Yrjänäinen as a part of a GIS project course.

Notice that the dem-tif used in this code is from [Index of /data/dem10m (latuviitta.kapsi.fi)](https://latuviitta.kapsi.fi/data/dem10m/), but omitted from the zip-file due to the large size of the file. To get the software running, the dem-tif should be downloaded to the public-folder, or the main.js should for example be modified to accept another cloud optimized geotiff as a source.



## Built with OpenLayers + Vite

This example demonstrates how the `ol` package can be used with [Vite](https://vitejs.dev/).

To get started, run the following (requires Node 14+):

    npx create-ol-app my-app --template vite

Then start a development server (available at http://localhost:5173):

    cd Dynamic-coloring
    npm install
    npm start

To generate a build ready for production:

    npm run build

Then deploy the contents of the `dist` directory to your server.  You can also run `npm run serve` to serve the results of the `dist` directory for preview.


