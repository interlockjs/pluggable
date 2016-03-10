import { CONTINUE } from "./pluggable";


/**
 * Invoke each plugin with two params, an override function and a transform
 * function.  When _these_ functions are invoked by individual plugins,
 * the plugin's override or transform function will be associated with the
 * name of the pluggable it is meant to override/transform.
 *
 * During execution, the transform- and override- functions will be invoked
 * to manipulate the output of pluggable steps.
 *
 * @param  {Object}  cxt   Context that will be extended with pluggable metadata.
 *
 * @return {Object}        Object to apply to pluggable-function entry point as its
 *                         context.
 */
export default function getBaseContext (cxt = {}, plugins = []) {
  cxt.__pluggables__ = { override: {}, transform: {} };
  const overrides = cxt.__pluggables__.override;
  const transforms = cxt.__pluggables__.transform;

  function override (pluggableFnName, overrideFn) {
    overrides[pluggableFnName] = (overrides[pluggableFnName] || []).concat(overrideFn);
  }
  function transform (pluggableFnName, transformFn) {
    transforms[pluggableFnName] = (transforms[pluggableFnName] || []).concat(transformFn);
  }
  override.CONTINUE = CONTINUE;

  plugins.forEach(plugin => plugin(override, transform));

  return cxt;
}
