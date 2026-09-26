import { use$, useSelector } from '@legendapp/state/react';
import React, { createElement } from 'react';
import { View, type ViewStyle } from 'react-native';
import { plugins$ } from './PluginManager';
import type { DisplayPlugin, PluginLocation } from './PluginTypes';

interface PluginRendererProps {
  location: PluginLocation;
  className?: string;
  props?: Record<string, any>;
}

export function PluginRenderer({ location, className = '', props = {} }: PluginRendererProps) {
  const allPlugins = useSelector(plugins$);

  // Filter plugins for this location
  const locationPlugins = Object.values(allPlugins).filter(
    (plugin): plugin is DisplayPlugin =>
      plugin.type === "display" &&
      plugin.childOf === location &&
      plugin.enabled !== false &&
      !!plugin.component
  );

  // If no plugins, return null
  if (locationPlugins.length === 0) {
    return null;
  }

  return (
    <View className={className}>
      {locationPlugins.map(plugin => <PluginSlot key={plugin.id} plugin={plugin} props={props} />)}
    </View>
  );
}

function getPluginStyle(plugin: DisplayPlugin) {
  const style: ViewStyle = {
    position: 'absolute',
  };

  const { position } = plugin;
  if (position === 't') {
    style.left = 0;
    style.top = 0;
    style.right = 0;
  }
  if (position === 'br') {
    style.right = 0;
    style.bottom = 0;
  }
  if (position === 'bl') {
    style.left = 0;
    style.bottom = 0;
  }

  return style;
}

function PluginSlot({plugin, props}: {plugin: DisplayPlugin; props: Record<string, any>}) {
  const visible = use$(() => plugin.shouldRender?.(props) ?? true);
  const Component = plugin.component;
  return visible && Component ? <Component {...props} style={getPluginStyle(plugin)} /> : null;
}
