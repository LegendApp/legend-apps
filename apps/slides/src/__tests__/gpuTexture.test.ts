// @ts-nocheck Exercise the actual async loader without native module imports.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
const filename = new URL("../TypeGPUShader.tsx",import.meta.url).pathname;
const require = createRequire(filename);
const {code} = transformSync(readFileSync(filename,"utf8"),{ filename,babelrc:false,configFile:false,presets:[require.resolve("@react-native/babel-preset")] });
function loader(platform, skia, bitmap, events) {
  return new Function("require","exports","fetch","createImageBitmap","GPUTextureUsage",code+"\nreturn loadImageTexture;")(
    name => ({"react":{},"react-native":{Platform:{OS:platform}},"@shopify/react-native-skia":skia,"react-native-webgpu":{},"react-native-reanimated":{},"@legend-apps/presentation":{},"./slidesStore":{}})[name] ?? require(name),{},
    async()=>({ok:true,blob:async()=>({})}),async()=>bitmap,{TEXTURE_BINDING:4,COPY_DST:2,RENDER_ATTACHMENT:16});
}
test("browser images upload premultiplied pixels and release decoding handles even on failure",async()=>{
  const events=[],bitmap={width:4,height:3,close:()=>events.push("closed")};
  const load=loader("web",{},bitmap,events);
  const texture={};let descriptor, destination;
  const device={ createTexture: d => { descriptor=d;return texture; },queue:{copyExternalImageToTexture:(_,to)=>{destination=to;}} };
  expect(await load(device,"/image.png")).toBe(texture);
  expect(descriptor.usage).toBe(22);
  expect(destination).toEqual({texture,premultipliedAlpha:true});
  expect(events).toEqual(["closed"]);
  device.queue.copyExternalImageToTexture=()=>{throw new Error("upload failed");};
  await expect(load(device,"/image.png")).rejects.toThrow("upload failed");
  expect(events).toEqual(["closed","closed"]);
});
test("native file URLs decode once, upload pixels, and release Skia handles",async()=>{
  const events=[],texture={},pixels=Uint8Array.from({length:56},(_,index)=>index).subarray(4,52);
  const image={width:()=>4,height:()=>3,readPixels:(_,__,options)=>{expect(options.alphaType).toBe("premul");return pixels;},dispose:()=>events.push("image")};
  const skia={AlphaType:{Premul:"premul"},ColorType:{RGBA_8888:"rgba"},Skia:{Data:{fromURI:async uri=>{expect(uri).toBe("file:///deck/image.png");return {dispose:()=>events.push("data")};}},Image:{MakeImageFromEncoded:()=>image}}};
  const load=loader("macos",skia,null,events);
  const device={createTexture:d=>{expect(d.usage).toBe(6);return texture;},queue:{writeTexture:(to,data,layout,size)=>{expect(to.texture).toBe(texture);expect(data).toBe(pixels.buffer);expect(layout).toEqual({offset:4,bytesPerRow:16});expect(new Uint8Array(data,layout.offset,48)).toEqual(pixels);expect(size).toEqual([4,3]);}}};
  expect(await load(device,"file:///deck/image.png")).toBe(texture);
  expect(events).toEqual(["image","data"]);
});
