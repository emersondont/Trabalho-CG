class Cart {
    constructor() {
        this.objHref;
        this.textureIndex;
        this.cameraTarget;
        this.cameraPosition;
        this.yRotation = degToRad(0);
        this.xRotation = degToRad(0);

        this.translationLocation = [];
        this.objPosition = [];
        this.parts = [];
        this.objOffset = [];

        this.countObj = 0;

        this.canvas = document.querySelector('#cart-canvas');
        this.gl = this.canvas.getContext("webgl2");
        if (!this.gl) {
            return;
        }
        twgl.setAttributePrefix("a_");
        this.meshProgramInfo = twgl.createProgramInfo(this.gl, [
            vertexShaderSource,
            fragmentShaderSource,
        ]);

        this.render = this.render.bind(this);

        var radius = 10;

        this.cameraTarget = [0, 1, 0];
        this.cameraPosition = m4.addVectors(this.cameraTarget, [
            0,
            0,
            radius,
        ]);

        // Set zNear and zFar to something hopefully appropriate
        // for the size of this object.
        this.zNear = radius / 50;
        this.zFar = radius * 3;

        this.animationCoords = [
            [0, 0, radius],
            [15, 0, radius / 2],
            [20, 0, radius / 2],
            [0, 0, radius * (-1)]
        ];

        this.t = 0;
        this.indexCoordsCurve = 0;

        //HTML
        const emptyButton = document.getElementById("empty-cart");
        emptyButton.addEventListener("click", () => {
            this.countObj = 0;

            this.translationLocation.length = 0
            this.objPosition.length = 0
            this.parts.length = 0
            this.objOffset.length = 0

            this.gl.clearColor(0.1176, 0.1176, 0.1725, 1); // Define a cor de limpeza para preto
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT); // Limpa o buffer de cor e profundidade

            const buttonMeuCarrinhoHTML = document.getElementById("open-modal");
            buttonMeuCarrinhoHTML.innerHTML = `Meu carrinho`
        });

        const buyButton = document.getElementById("buy");
        buyButton.addEventListener("click", () => {
            if (this.countObj == 0) {
                alert("Como que tu vai finalizar a compra se teu carrinho ta vazio?")
            }
            else {
                const buyModal = document.querySelector(".buy-card");
                const p = document.getElementById("desc-buy");

                buyModal.style.display = "flex";
                p.innerHTML = `Sua compra deu R$${this.countObj*50},00. Faça o pix ⬇`
            }


        });

        requestAnimationFrame(this.render)
    }

    getCount() {
        return this.countObj
    }

    async newObj(objHref, textureIndex) {
        if (this.countObj == 10) {
            alert("Pare homi, seu carrinho já está cheio!")
        }
        else {
            this.objHref = objHref;
            this.textureIndex = textureIndex;

            //de - 9 a 9, para 10 obj
            const x = 1.8 * this.countObj - 8

            this.objPosition.push([x, 0, 0])

            await this.main()

            this.countObj++;
        }
    }

    async main() {
        const response = await fetch(this.objHref);
        const text = await response.text();
        this.obj = parseOBJ(text);

        await this.loadTexture()

        const extents = this.getGeometriesExtents(this.obj.geometries);
        const range = m4.subtractVectors(extents.max, extents.min);
        // amount to move the object so its center is at the origin
        this.objOffset.push(
            m4.scaleVector(
                m4.addVectors(
                    extents.min,
                    m4.scaleVector(range, 0.5)),
                -1)
        )

        this.translationLocation.push(this.gl.getUniformLocation(this.meshProgramInfo.program, "u_translation"))
    }

    async loadTexture() {
        const baseHref = new URL(this.objHref, window.location.href);
        const matTexts = await Promise.all(this.obj.materialLibs.map(async filename => {
            const matHref = new URL(filename, baseHref).href;
            const novaString = matHref.substring(0, matHref.indexOf('.mtl')) + this.textureIndex + '.mtl'
            const response = await fetch(novaString);
            return await response.text();
        }));
        this.materials = parseMTL(matTexts.join('\n'));

        const textures = {
            defaultWhite: twgl.createTexture(this.gl, { src: [255, 255, 255, 255] }),
            defaultNormal: twgl.createTexture(this.gl, { src: [127, 127, 255, 0] }),
        };

        // load texture for materials
        for (const material of Object.values(this.materials)) {
            Object.entries(material)
                .filter(([key]) => key.endsWith('Map'))
                .forEach(([key, filename]) => {
                    let texture = textures[filename];
                    if (!texture) {
                        const textureHref = new URL(filename, baseHref).href;
                        texture = twgl.createTexture(this.gl, { src: textureHref, flipY: true });
                        textures[filename] = texture;
                    }
                    material[key] = texture;
                });
        }

        // hack the materials so we can see the specular map
        Object.values(this.materials).forEach(m => {
            m.shininess = 25;
            m.specular = [3, 2, 1];
        });


        const defaultMaterial = {
            diffuse: [1, 1, 1],
            diffuseMap: textures.defaultWhite,
            normalMap: textures.defaultNormal,
            ambient: [0, 0, 0],
            specular: [1, 1, 1],
            specularMap: textures.defaultWhite,
            shininess: 400,
            opacity: 1,
        };

        this.parts.push(this.obj.geometries.map(({ material, data }) => {
            if (data.color) {
                if (data.position.length === data.color.length) {
                    // it's 3. The our helper library assumes 4 so we need
                    // to tell it there are only 3.
                    data.color = { numComponents: 3, data: data.color };
                }
            } else {
                // there are no vertex colors so just use constant white
                data.color = { value: [1, 1, 1, 1] };
            }

            // generate tangents if we have the data to do so.
            if (data.texcoord && data.normal) {
                data.tangent = generateTangents(data.position, data.texcoord);
            } else {
                // There are no tangents
                data.tangent = { value: [1, 0, 0] };
            }

            if (!data.texcoord) {
                data.texcoord = { value: [0, 0] };
            }

            if (!data.normal) {
                // we probably want to generate normals if there are none
                data.normal = { value: [0, 0, 1] };
            }

            // create a buffer for each array by calling
            // gl.createBuffer, gl.bindBuffer, gl.bufferData
            const bufferInfo = twgl.createBufferInfoFromArrays(this.gl, data);
            const vao = twgl.createVAOFromBufferInfo(this.gl, this.meshProgramInfo, bufferInfo);
            return {
                material: {
                    ...defaultMaterial,
                    ...this.materials[material],
                },
                bufferInfo,
                vao,
            };
        })
        )
    }

    getExtents(positions) {
        const min = positions.slice(0, 3);
        const max = positions.slice(0, 3);
        for (let i = 3; i < positions.length; i += 3) {
            for (let j = 0; j < 3; ++j) {
                const v = positions[i + j];
                min[j] = Math.min(v, min[j]);
                max[j] = Math.max(v, max[j]);
            }
        }
        return { min, max };
    }

    getGeometriesExtents(geometries) {
        return geometries.reduce(({ min, max }, { data }) => {
            const minMax = this.getExtents(data.position);
            return {
                min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
                max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
            };
        }, {
            min: Array(3).fill(Number.POSITIVE_INFINITY),
            max: Array(3).fill(Number.NEGATIVE_INFINITY),
        });
    }

    render() {

        if (this.countObj != 0) {

            twgl.resizeCanvasToDisplaySize(this.gl.canvas);
            this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
            this.gl.enable(this.gl.DEPTH_TEST);

            const fieldOfViewRadians = degToRad(60);
            const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
            const projection = m4.perspective(fieldOfViewRadians, aspect, this.zNear, this.zFar);

            const up = [0, 1, 0];

            // Compute the camera's matrix using look at.
            const camera = m4.lookAt(this.cameraPosition, this.cameraTarget, up);

            // Make a view matrix from the camera matrix.
            const view = m4.inverse(camera);

            const sharedUniforms = {
                u_lightDirection: m4.normalize([-10, 2, 2]),
                u_view: view,
                u_projection: projection,
                u_viewWorldPosition: this.cameraPosition
            };

            this.gl.useProgram(this.meshProgramInfo.program);

            // calls gl.uniform
            twgl.setUniforms(this.meshProgramInfo, sharedUniforms);


            //passa por todos obj e imprime
            for (let i = 0; i < this.countObj; i++) {
                // compute the world matrix once since all parts
                // are at the same space.
                let u_world = m4.identity();
                u_world = m4.translate(u_world, ...this.objOffset[i]);

                this.gl.uniform3f(this.translationLocation[i], this.objPosition[i][0], this.objPosition[i][1], this.objPosition[i][2]);

                for (const { bufferInfo, vao, material } of this.parts[i]) {
                    // set the attributes for this part.
                    this.gl.bindVertexArray(vao);
                    // calls gl.uniform
                    twgl.setUniforms(this.meshProgramInfo, {
                        u_world,
                    }, material);
                    // calls gl.drawArrays or gl.drawElements
                    twgl.drawBufferInfo(this.gl, bufferInfo);
                }
            }
        }
        requestAnimationFrame(this.render)
    }
}

