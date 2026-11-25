import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius } from '../theme';

type Coords = { latitude: number; longitude: number };

type Props = {
  courierLocation: Coords | null;
  destination: (Coords & { label: string }) | null;
  destinationType: 'restaurant' | 'customer';
  locationDenied: boolean;
};

export default function LiveMap({ courierLocation, destination, destinationType, locationDenied }: Props) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (courierLocation && destination) {
      mapRef.current.fitToCoordinates([courierLocation, destination], {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    } else if (courierLocation) {
      mapRef.current.animateToRegion({ ...courierLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    }
  }, [courierLocation?.latitude, courierLocation?.longitude, destination?.latitude, destination?.longitude]);

  if (locationDenied) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="location-outline" size={22} color={colors.subtext} />
        <Text style={styles.placeholderText}>فعّل صلاحية الموقع لعرض الخريطة الحية.</Text>
      </View>
    );
  }

  if (!courierLocation) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>جارِ تحديد موقعك...</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ ...courierLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
      >
        <Marker coordinate={courierLocation} title="موقعك" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.courierMarker}>
            <Ionicons name="bicycle" size={16} color="#fff" />
          </View>
        </Marker>
        {destination ? (
          <Marker
            coordinate={destination}
            title={destination.label}
            pinColor={destinationType === 'restaurant' ? colors.primary : colors.accent}
          />
        ) : null}
        {destination ? (
          <Polyline
            coordinates={[courierLocation, destination]}
            strokeColor={colors.accent}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: 'hidden', height: 200 },
  map: { flex: 1 },
  placeholder: {
    height: 140,
    borderRadius: radius.lg,
    backgroundColor: colors.neutralTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  placeholderText: { fontSize: 12, fontWeight: '700', color: colors.subtext },
  courierMarker: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
