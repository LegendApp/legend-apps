#include "webgpu.h"
#include <fstream>
#include <iostream>
#include <string>
#include <thread>
#include <chrono>
static WGPUAdapter adapter;
static WGPUDevice device;
static bool done;
static int failures;
static void waitFor(WGPUInstance instance) {
  for (int i=0; !done && i<1000; i++) { wgpuInstanceProcessEvents(instance); std::this_thread::sleep_for(std::chrono::milliseconds(10)); }
  if (!done) { std::cerr << "GPU callback timeout\n"; exit(2); }
}
int main(int argc, char** argv) {
  auto instance = wgpuCreateInstance(nullptr);
  auto options = WGPU_REQUEST_ADAPTER_OPTIONS_INIT;
  options.backendType = WGPUBackendType_Metal;
  auto adapterCallback = WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT;
  adapterCallback.mode = WGPUCallbackMode_AllowProcessEvents;
  adapterCallback.callback = [](WGPURequestAdapterStatus status, WGPUAdapter value, WGPUStringView message, void*, void*) { adapter=value; done=true; if (!adapter) std::cerr.write(message.data,message.length); };
  wgpuInstanceRequestAdapter(instance, &options, adapterCallback); waitFor(instance);
  if (!adapter) return 2;
  done=false;
  auto descriptor = WGPU_DEVICE_DESCRIPTOR_INIT;
  auto deviceCallback = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
  deviceCallback.mode = WGPUCallbackMode_AllowProcessEvents;
  deviceCallback.callback = [](WGPURequestDeviceStatus status, WGPUDevice value, WGPUStringView message, void*, void*) { device=value; done=true; if (!device) std::cerr.write(message.data,message.length); };
  wgpuAdapterRequestDevice(adapter, &descriptor, deviceCallback); waitFor(instance);
  if (!device) return 2;
  for(int i=1;i<argc;i++) {
    std::ifstream stream(argv[i]); std::string code((std::istreambuf_iterator<char>(stream)), std::istreambuf_iterator<char>());
    auto source = WGPU_SHADER_SOURCE_WGSL_INIT; source.code = {code.data(),code.size()};
    auto shader = WGPU_SHADER_MODULE_DESCRIPTOR_INIT; shader.nextInChain = &source.chain;
    auto module = wgpuDeviceCreateShaderModule(device,&shader);
    done=false;
    auto callback = WGPU_COMPILATION_INFO_CALLBACK_INFO_INIT; callback.mode=WGPUCallbackMode_AllowProcessEvents;
    callback.callback=[](WGPUCompilationInfoRequestStatus status,const WGPUCompilationInfo* info,void*,void*) {
      if (!info) { failures++; done=true; return; }
      for(size_t j=0;j<info->messageCount;j++) { auto m=info->messages[j]; std::cerr << m.lineNum << ":" << m.linePos << " "; std::cerr.write(m.message.data,m.message.length); std::cerr << "\n"; if(m.type==WGPUCompilationMessageType_Error) failures++; }
      done=true;
    };
    std::cout << argv[i] << "\n";
    wgpuShaderModuleGetCompilationInfo(module,callback); waitFor(instance); wgpuShaderModuleRelease(module);
  }
  wgpuDeviceRelease(device); wgpuAdapterRelease(adapter); wgpuInstanceRelease(instance);
  return failures ? 1 : 0;
}
