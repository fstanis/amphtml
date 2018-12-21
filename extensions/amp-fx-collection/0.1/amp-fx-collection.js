/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {AmpEvents} from '../../../src/amp-events';
import {FxProvider} from './providers/fx-provider';
import {Services} from '../../../src/services';
import {devAssert, rethrowAsync, user} from '../../../src/log';
import {iterateCursor} from '../../../src/dom';
import {listen} from '../../../src/event-helper';
import {map} from '../../../src/utils/object';

const TAG = 'amp-fx-collection';

/**
 * Enum for list of supported visual effects.
 * @enum {string}
 */
const FxType = {
  PARALLAX: 'parallax',
  FADE_IN: 'fade-in',
  FADE_IN_SCROLL: 'fade-in-scroll',
  FLY_IN_BOTTOM: 'fly-in-bottom',
  FLY_IN_LEFT: 'fly-in-left',
  FLY_IN_RIGHT: 'fly-in-right',
  FLY_IN_TOP: 'fly-in-top',
};

const restrictedFxTypes = {
  'parallax': ['fly-in-top', 'fly-in-bottom'],
  'fly-in-top': ['parallax', 'fly-in-bottom'],
  'fly-in-bottom': ['fly-in-top', 'parallax'],
  'fly-in-right': ['fly-in-left'],
  'fly-in-left': ['fly-in-right'],
  'fade-in': ['fade-in-scroll'],
  'fade-in-scroll': ['fade-in'],
};

/**
 * Bootstraps elements that have `amp-fx=<fx1 fx2>` attribute and installs
 * the specified effects on them.
 * @visibleForTesting
 */
export class AmpFxCollection {

  /**
   * @param  {!../../../src/service/ampdoc-impl.AmpDoc} ampdoc
   */
  constructor(ampdoc) {

    /** @private @const {!../../../src/service/ampdoc-impl.AmpDoc} */
    this.ampdoc_ = ampdoc;

    /** @private @const {!Document|!ShadowRoot} */
    this.root_ = ampdoc.getRootNode();

    /** @private @const {!Array<!Element>} */
    this.seen_ = [];

    /** @private @const {!../../../src/service/viewer-impl.Viewer} */
    this.viewer_ = Services.viewerForDoc(ampdoc);

    /** @private @const {!Object<FxType, FxProvider>} */
    this.fxProviderInstances_ = map();

    Promise.all([
      ampdoc.whenReady(),
      this.viewer_.whenFirstVisible(),
    ]).then(() => {
      // Scan when page becomes visible.
      this.scan_();
      // Rescan as DOM changes happen.
      listen(this.root_, AmpEvents.DOM_UPDATE, this.scan_.bind(this));
    });
  }

  /**
   * Scans the root for fx-enabled elements and registers them with the
   * fx provider.
   */
  scan_() {
    const fxElements = this.root_.querySelectorAll('[amp-fx]');
    iterateCursor(fxElements, fxElement => {
      if (this.seen_.includes(fxElement)) {
        return;
      }

      // Don't break for all components if only a subset are misconfigured.
      try {
        this.register_(fxElement);
        this.seen_.push(fxElement);
      } catch (e) {
        rethrowAsync(e);
      }
    });
  }

  /**
   * Registers an fx-enabled element with its requested fx providers.
   * @param {!Element} fxElement
   */
  register_(fxElement) {
    devAssert(fxElement.hasAttribute('amp-fx'));
    devAssert(!this.seen_.includes(fxElement));
    devAssert(this.viewer_.isVisible());

    const fxTypes = this.getFxTypes_(fxElement);

    fxTypes.forEach(fxType => {
      const fxProvider = this.getFxProvider_(fxType);
      fxProvider.installOn(fxElement);
    });
  }

  /**
   * Returns the array of fx types this component has specified as a
   * space-separated list in the value of `amp-fx` attribute.
   * e.g. `amp-fx="parallax fade-in"
   *
   * @param {!Element} fxElement
   * @return {!Array<!FxType>}
   */
  getFxTypes_(fxElement) {
    devAssert(fxElement.hasAttribute('amp-fx'));
    const fxTypes = fxElement.getAttribute('amp-fx')
        .trim()
        .toLowerCase()
        .split(/\s+/);

    user().assert(fxTypes.length, 'No value provided for `amp-fx` attribute');

    // Validate that we support the requested fx types.
    fxTypes.forEach(fxType => {
      user().assertEnumValue(FxType, fxType, 'amp-fx');
    });

    this.sanitizeFxTypes_(fxTypes);

    return fxTypes;
  }

  /**
   * Returns the array of fx types this component after checking that no
   * clashing fxTypes are present on the same element.
   * e.g. `amp-fx="parallax fade-in"
   *
   * @param {!Array<!FxType>} fxTypes
   * @return {!Array<!FxType>}
   */
  sanitizeFxTypes_(fxTypes) {
    for (let i = 0; i < fxTypes.length; i++) {
      const currentType = fxTypes[i];
      if (currentType in restrictedFxTypes) {
        for (let j = i + 1; j < fxTypes.length; j++) {
          if (restrictedFxTypes[currentType].indexOf(fxTypes[j]) !== -1) {
            user().warn(TAG,
                '%s preset can\'t be combined with %s preset as the ' +
                'resulting animation isn\'t valid.', currentType, fxTypes[j]);
            fxTypes.splice(j, 1);
          }
        }
      }
    }
    return fxTypes;
  }

  /**
   * Given an fx type, instantiates the appropriate provider if needed and
   * returns it.
   * @param {FxType} fxType
   */
  getFxProvider_(fxType) {
    if (!this.fxProviderInstances_[fxType]) {
      this.fxProviderInstances_[fxType] =
        new FxProvider(this.ampdoc_, fxType);
    }
    return this.fxProviderInstances_[fxType];
  }
}

AMP.extension(TAG, '0.1', AMP => {
  AMP.registerServiceForDoc(TAG, AmpFxCollection);
});
